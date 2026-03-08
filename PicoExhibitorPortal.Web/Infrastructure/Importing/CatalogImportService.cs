using System.IO.Compression;
using System.Net;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Domain;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;
using PicoExhibitorPortal.Web.Infrastructure.Orders;

namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public sealed partial class CatalogImportService(
    PortalDbContext dbContext,
    IPortalSettingsService settingsService,
    IWebHostEnvironment environment,
    IPriceSheetParser priceSheetParser,
    IImageVariantService imageVariantService,
    ILogger<CatalogImportService> logger) : ICatalogImportService
{
    private static readonly Dictionary<string, string> CategoryMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Stackable Chairs"] = "كراسي قابلة للتكديس",
        ["Meeting & Office Chairs"] = "كراسي الاجتماعات والمكاتب",
        ["Armchairs"] = "كراسي مفردة",
        ["Low Tables"] = "طاولات منخفضة",
        ["Tables"] = "طاولات",
        ["System Counter"] = "كاونترات عرض",
        ["Accessories"] = "إكسسوارات",
        ["Lights & Electrical"] = "إضاءة وكهرباء",
        ["TV Screens & Stands"] = "شاشات وحوامل",
        ["LED Posters"] = "شاشات ليد إعلانية",
        ["Carpet"] = "سجاد"
    };

    public async Task<ImportBatch?> RunConfiguredImportAsync(CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(settings.PptxSourcePath) || !File.Exists(settings.PptxSourcePath))
        {
            logger.LogWarning("Configured PPTX source path is missing.");
            return null;
        }

        var batch = new ImportBatch
        {
            SourceFileName = Path.GetFileName(settings.PptxSourcePath),
            SourceFilePath = settings.PptxSourcePath,
            ImportedAtUtc = DateTime.UtcNow
        };

        dbContext.ImportBatches.Add(batch);
        await dbContext.SaveChangesAsync(cancellationToken);

        var rates = priceSheetParser.Parse(settings.PdfSourcePath);
        var ratesById = rates
            .Where(x => !string.IsNullOrWhiteSpace(x.SourceItemId))
            .GroupBy(x => NormalizeIdentifier(x.SourceItemId))
            .ToDictionary(x => x.Key, x => x.First());
        var ambiguousCodes = rates
            .Where(x => !string.IsNullOrWhiteSpace(x.PicoCode))
            .GroupBy(x => x.PicoCode.ToUpperInvariant())
            .Where(x => x.Select(rate => NormalizeIdentifier(rate.SourceItemId)).Distinct().Count() > 1
                     || x.Select(rate => rate.UnitRate).Distinct().Count() > 1)
            .Select(x => x.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var ratesByCode = rates
            .Where(x => !string.IsNullOrWhiteSpace(x.PicoCode))
            .GroupBy(x => x.PicoCode.ToUpperInvariant())
            .Where(x => !ambiguousCodes.Contains(x.Key))
            .ToDictionary(x => x.Key, x => x.First());

        var records = await ParsePptxAsync(batch.Id, settings.PptxSourcePath, settings.Currency, ratesById, ratesByCode, cancellationToken);
        var processedItems = new HashSet<CatalogItem>();
        for (var index = 0; index < records.Count; index++)
        {
            var record = records[index];
            batch.Items.Add(new ImportBatchItem
            {
                SourceItemId = record.SourceItemId,
                PicoCode = record.PicoCode,
                Category = record.CategoryEn,
                NameEn = record.NameEn,
                NameAr = record.NameAr,
                DescriptionEn = record.DescriptionEn,
                DescriptionAr = record.DescriptionAr,
                SpecsEn = record.SpecsEn,
                SpecsAr = record.SpecsAr,
                OriginalImagePath = record.OriginalImagePath,
                PrimaryImagePath = record.PrimaryImagePath,
                CardImagePath = record.CardImagePath,
                DetailImagePath = record.DetailImagePath,
                ThumbnailImagePath = record.ThumbnailImagePath,
                SuggestedPrice = record.SuggestedPrice,
                Currency = record.Currency,
                PriceSourceReference = record.PriceSourceReference,
                PriceMatchMethod = record.PriceMatchMethod,
                Warning = record.Warning
            });

            CatalogItem? existing = null;
            if (!string.IsNullOrWhiteSpace(record.SourceItemId))
            {
                existing = await dbContext.CatalogItems.Include(x => x.GalleryImages)
                    .FirstOrDefaultAsync(x => x.SourceItemId == record.SourceItemId, cancellationToken);
            }

            if (existing is null && !string.IsNullOrWhiteSpace(record.PicoCode) && !ambiguousCodes.Contains(record.PicoCode.ToUpperInvariant()))
            {
                existing = await dbContext.CatalogItems.Include(x => x.GalleryImages)
                    .FirstOrDefaultAsync(x => x.PicoCode == record.PicoCode, cancellationToken);
            }

            if (existing is null)
            {
                existing = new CatalogItem
                {
                    SourceItemId = record.SourceItemId,
                    PicoCode = record.PicoCode,
                    Slug = Slugify(record.NameEn, record.PicoCode),
                    ImportedAtUtc = DateTime.UtcNow
                };
                dbContext.CatalogItems.Add(existing);
            }

            processedItems.Add(existing);

            existing.NameEn = record.NameEn;
            existing.NameAr = record.NameAr;
            existing.DescriptionEn = record.DescriptionEn;
            existing.DescriptionAr = record.DescriptionAr;
            existing.CategoryEn = record.CategoryEn;
            existing.CategoryAr = record.CategoryAr;
            existing.DimensionsAndSpecsEn = record.SpecsEn;
            existing.DimensionsAndSpecsAr = record.SpecsAr;
            existing.OriginalImagePath = record.OriginalImagePath;
            existing.PrimaryImagePath = record.PrimaryImagePath;
            existing.CardImagePath = record.CardImagePath;
            existing.DetailImagePath = record.DetailImagePath;
            existing.ThumbnailImagePath = record.ThumbnailImagePath;
            existing.SourceDocumentReference = record.SourceReference;
            existing.Currency = record.Currency;
            existing.PriceSourceReference = record.PriceSourceReference;
            existing.SortOrder = existing.SortOrder == 0 ? index + 1 : existing.SortOrder;

            existing.Price = record.SuggestedPrice;
            existing.IsActive = true;
            existing.IsVerified = true;
            existing.GalleryImages.Clear();

            for (var imageIndex = 0; imageIndex < record.GalleryImages.Count; imageIndex++)
            {
                existing.GalleryImages.Add(new CatalogItemImage
                {
                    ImagePath = record.GalleryImages[imageIndex],
                    SortOrder = imageIndex,
                    IsPrimary = imageIndex == 0
                });
            }
        }

        if (ambiguousCodes.Count > 0)
        {
            var ambiguousCatalogItems = await dbContext.CatalogItems
                .Where(x => ambiguousCodes.Contains(x.PicoCode))
                .ToListAsync(cancellationToken);

            foreach (var staleItem in ambiguousCatalogItems.Where(x => !processedItems.Contains(x)))
            {
                staleItem.IsActive = false;
                staleItem.IsVerified = false;
            }
        }

        var duplicateCandidates = await dbContext.CatalogItems.ToListAsync(cancellationToken);
        var duplicateGroups = duplicateCandidates
            .GroupBy(x => new
            {
                Code = x.PicoCode.Trim().ToUpperInvariant(),
                Description = x.DescriptionEn.Trim(),
                Specs = x.DimensionsAndSpecsEn.Trim(),
                Category = x.CategoryEn.Trim(),
                x.Price,
                x.Currency
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.Key.Code) && x.Count() > 1);

        foreach (var group in duplicateGroups)
        {
            var keep = group
                .OrderByDescending(processedItems.Contains)
                .ThenByDescending(x => x.PrimaryImagePath.Contains("-hd2.", StringComparison.OrdinalIgnoreCase))
                .ThenByDescending(x => x.LastVerifiedAtUtc ?? x.ImportedAtUtc)
                .First();

            foreach (var staleItem in group.Where(x => x != keep))
            {
                staleItem.IsActive = false;
                staleItem.IsVerified = false;
            }
        }

        batch.Summary = $"Imported {records.Count} staged items from {batch.SourceFileName}.";
        batch.Warnings = string.Join(Environment.NewLine, records.Where(x => !string.IsNullOrWhiteSpace(x.Warning)).Select(x => $"{x.PicoCode}: {x.Warning}"));
        await dbContext.SaveChangesAsync(cancellationToken);
        return batch;
    }

    public async Task<ImportBatch?> RunUploadedImportAsync(Stream pptxStream, string pptxFileName, Stream? pdfStream, string? pdfFileName, CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetAsync(cancellationToken);
        var uploadRoot = Path.Combine(environment.WebRootPath, "uploads", "source");
        Directory.CreateDirectory(uploadRoot);

        var safePptxFileName = SanitizeUploadFileName(pptxFileName, ".pptx");
        var pptxPath = Path.Combine(uploadRoot, safePptxFileName);
        await using (var file = File.Create(pptxPath))
            await pptxStream.CopyToAsync(file, cancellationToken);

        string? pdfPath = null;
        if (pdfStream is not null && !string.IsNullOrWhiteSpace(pdfFileName))
        {
            var safePdfFileName = SanitizeUploadFileName(pdfFileName, ".pdf");
            pdfPath = Path.Combine(uploadRoot, safePdfFileName);
            await using var file = File.Create(pdfPath);
            await pdfStream.CopyToAsync(file, cancellationToken);
        }

        await settingsService.SaveAsync(new PortalSettingsView
        {
            InternalRecipients = settings.InternalRecipients,
            CcRecipients = settings.CcRecipients,
            PptxSourcePath = pptxPath,
            PdfSourcePath = pdfPath ?? settings.PdfSourcePath,
            Currency = settings.Currency
        }, cancellationToken);

        return await RunConfiguredImportAsync(cancellationToken);
    }

    private static string SanitizeUploadFileName(string fileName, string fallbackExtension)
    {
        var safeName = Path.GetFileName(fileName ?? string.Empty);
        var extension = Path.GetExtension(safeName);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = fallbackExtension;
        }

        var baseName = Path.GetFileNameWithoutExtension(safeName);
        baseName = string.IsNullOrWhiteSpace(baseName)
            ? "upload"
            : Regex.Replace(baseName, @"[^A-Za-z0-9._-]+", "-").Trim('-');

        if (string.IsNullOrWhiteSpace(baseName))
        {
            baseName = "upload";
        }

        return $"{baseName}{extension.ToLowerInvariant()}";
    }

    public async Task<IReadOnlyList<ImportBatch>> GetBatchesAsync(CancellationToken cancellationToken) =>
        await dbContext.ImportBatches.AsNoTracking().Include(x => x.Items).OrderByDescending(x => x.ImportedAtUtc).ToListAsync(cancellationToken);

    public async Task<List<ImportedCatalogRecord>> ParsePptxAsync(
        int batchId,
        string pptxPath,
        string currency,
        IReadOnlyDictionary<string, PriceSheetEntry> ratesById,
        IReadOnlyDictionary<string, PriceSheetEntry> ratesByCode,
        CancellationToken cancellationToken)
    {
        using var zip = ZipFile.OpenRead(pptxPath);
        var outputFolder = Path.Combine(environment.WebRootPath, "uploads", "imports", batchId.ToString());
        Directory.CreateDirectory(outputFolder);

        var slides = zip.Entries
            .Where(x => x.FullName.StartsWith("ppt/slides/slide", StringComparison.OrdinalIgnoreCase) && x.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
            .OrderBy(x => SlideNumberExpression().Match(x.FullName).Groups[1].Value)
            .ToList();

        var records = new List<ImportedCatalogRecord>();
        foreach (var slide in slides)
        {
            var xml = XDocument.Load(slide.Open());
            var texts = xml.Descendants().Where(x => x.Name.LocalName == "t").Select(x => WebUtility.HtmlDecode(x.Value)).ToList();
            if (texts.Count == 0)
            {
                continue;
            }

            var normalized = Normalize(string.Join(" | ", texts));
            var categoryEn = DetermineCategory(normalized);
            var categoryAr = CategoryMap.GetValueOrDefault(categoryEn, categoryEn);
            var matches = ItemExpression().Matches(normalized);
            var slideImages = ExtractSlideImages(zip, slide.FullName, outputFolder);

            for (var index = 0; index < matches.Count; index++)
            {
                var match = matches[index];
                var description = match.Groups["description"].Value.Trim();
                var image = slideImages.Count > index ? slideImages[index] : slideImages.FirstOrDefault() ?? string.Empty;
                var variants = await imageVariantService.ProcessAsync(image, batchId, cancellationToken);
                var normalizedId = NormalizeIdentifier(match.Groups["id"].Value);
                var normalizedCode = match.Groups["code"].Value.Trim().ToUpperInvariant();
                var matchEntry = ratesById.TryGetValue(normalizedId, out var idEntry)
                    ? idEntry
                    : ratesByCode.TryGetValue(normalizedCode, out var codeEntry)
                        ? codeEntry
                        : null;
                var price = matchEntry?.UnitRate;
                var name = BuildName(description, match.Groups["code"].Value);
                var specs = ExtractSpecs(description);

                records.Add(new ImportedCatalogRecord
                {
                    SourceItemId = match.Groups["id"].Value.Trim(),
                    PicoCode = match.Groups["code"].Value.Trim(),
                    CategoryEn = categoryEn,
                    CategoryAr = categoryAr,
                    NameEn = name,
                    NameAr = name,
                    DescriptionEn = description,
                    DescriptionAr = description,
                    SpecsEn = specs,
                    SpecsAr = specs,
                    OriginalImagePath = variants.OriginalPath,
                    SuggestedPrice = price,
                    Currency = currency,
                    SourceReference = $"{Path.GetFileName(pptxPath)}::{slide.FullName}",
                    PrimaryImagePath = variants.PrimaryPath,
                    CardImagePath = variants.CardPath,
                    DetailImagePath = variants.DetailPath,
                    ThumbnailImagePath = variants.ThumbnailPath,
                    PriceSourceReference = matchEntry?.SourceReference ?? string.Empty,
                    PriceMatchMethod = matchEntry is null ? string.Empty : ratesById.ContainsKey(normalizedId) ? "SourceItemId" : "PicoCode",
                    GalleryImages = string.IsNullOrWhiteSpace(variants.OriginalPath) ? [] : [variants.OriginalPath],
                    Warning = price.HasValue ? string.Empty : "No authoritative price match found in the uploaded rate list."
                });
            }
        }

        return records;
    }

    private static string DetermineCategory(string normalized)
    {
        foreach (var name in CategoryMap.Keys)
        {
            if (normalized.Contains(name, StringComparison.OrdinalIgnoreCase))
            {
                return name;
            }
        }

        return "Catalog";
    }

    private static string Normalize(string input)
    {
        var value = input.Replace("I D", "ID", StringComparison.OrdinalIgnoreCase)
            .Replace("Ų", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("–", "-", StringComparison.OrdinalIgnoreCase);
        value = Regex.Replace(value, @"\s*\|\s*", " ");
        value = Regex.Replace(value, @"\s{2,}", " ");
        return value.Trim();
    }

    private static string BuildName(string description, string code)
    {
        var trimmed = Regex.Replace(description, @"H\d.*$", string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return code;
        }

        return string.Join(' ', trimmed.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(10));
    }

    private static string ExtractSpecs(string description)
    {
        var match = Regex.Match(description, @"(H\d.*)$");
        return match.Success ? match.Groups[1].Value.Trim() : description;
    }

    private static decimal? TryReadPrice(string description)
    {
        var match = Regex.Match(description, @"(?:BHD|BD)\s*(\d+(?:\.\d{1,3})?)", RegexOptions.IgnoreCase);
        return match.Success && decimal.TryParse(match.Groups[1].Value, out var value) ? value : null;
    }

    private static string NormalizeIdentifier(string value) => Regex.Replace(value ?? string.Empty, @"\D", string.Empty);

    private List<string> ExtractSlideImages(ZipArchive zip, string slidePath, string outputFolder)
    {
        var relPath = $"ppt/slides/_rels/{Path.GetFileName(slidePath)}.rels";
        var relEntry = zip.GetEntry(relPath);
        if (relEntry is null)
        {
            return [];
        }

        var relXml = XDocument.Load(relEntry.Open());
        var targets = relXml.Descendants()
            .Where(x => x.Name.LocalName == "Relationship")
            .Select(x => x.Attribute("Target")?.Value ?? string.Empty)
            .Where(x => x.Contains("../media/", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var results = new List<string>();
        foreach (var target in targets)
        {
            var entry = zip.GetEntry($"ppt/{target.Replace("../", string.Empty, StringComparison.OrdinalIgnoreCase)}");
            if (entry is null)
            {
                continue;
            }

            var fileName = $"{Guid.NewGuid():N}{Path.GetExtension(entry.FullName)}";
            var filePath = Path.Combine(outputFolder, fileName);
            using var source = entry.Open();
            using var destination = File.Create(filePath);
            source.CopyTo(destination);
            results.Add($"/uploads/imports/{Path.GetFileName(outputFolder)}/{fileName}");
        }

        return results;
    }

    private static string Slugify(string name, string code)
    {
        var value = $"{name}-{code}".ToLowerInvariant();
        value = Regex.Replace(value, @"[^a-z0-9]+", "-");
        return value.Trim('-');
    }

    [GeneratedRegex(@"slide(\d+)\.xml", RegexOptions.IgnoreCase)]
    private static partial Regex SlideNumberExpression();

    [GeneratedRegex(@"ID\s+(?<id>[\d/\-\s]+)\s+(?<code>[A-Z0-9/]+)\s+\[(?<qty>[^\]]*)\]\s+(?<description>.*?)(?=(?:ID\s+[\d/\-\s]+)|$)", RegexOptions.Singleline)]
    private static partial Regex ItemExpression();
}
