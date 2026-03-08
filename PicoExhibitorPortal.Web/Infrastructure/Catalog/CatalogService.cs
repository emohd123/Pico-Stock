using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Domain;
using PicoExhibitorPortal.Web.Models.Catalog;
using System.Text;

namespace PicoExhibitorPortal.Web.Infrastructure.Catalog;

public sealed class CatalogService(PortalDbContext dbContext) : ICatalogService
{
    public async Task<IReadOnlyList<CatalogListItemViewModel>> GetVisibleCatalogAsync(string? category, CancellationToken cancellationToken)
    {
        var query = dbContext.CatalogItems.AsNoTracking().Where(x => x.IsActive && x.IsVerified);
        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(x => x.CategoryEn == category || x.CategoryAr == category);
        }

        var items = await query.OrderBy(x => x.SortOrder).ThenBy(x => x.NameEn)
            .Select(x => new CatalogListItemViewModel
            {
                Id = x.Id,
                Slug = x.Slug,
                NameEn = x.NameEn,
                NameAr = x.NameAr,
                CategoryEn = x.CategoryEn,
                CategoryAr = x.CategoryAr,
                PrimaryImagePath = !string.IsNullOrWhiteSpace(x.CardImagePath) ? x.CardImagePath : x.PrimaryImagePath,
                Price = x.Price,
                Currency = x.Currency,
                IsVerified = x.IsVerified,
                Code = x.PicoCode
            }).ToListAsync(cancellationToken);

        return items
            .GroupBy(x => new
            {
                Code = x.Code.Trim().ToUpperInvariant(),
                Name = x.NameEn.Trim(),
                Category = x.CategoryEn.Trim(),
                x.Price,
                x.Currency
            })
            .Select(x => x
                .OrderByDescending(item => item.PrimaryImagePath.Contains("-hd2.", StringComparison.OrdinalIgnoreCase))
                .ThenBy(item => item.Slug, StringComparer.OrdinalIgnoreCase)
                .First())
            .ToList();
    }

    public async Task<IReadOnlyList<CatalogListItemViewModel>> GetAdminCatalogAsync(CancellationToken cancellationToken) =>
        await dbContext.CatalogItems.AsNoTracking()
            .OrderBy(x => x.IsVerified).ThenBy(x => x.CategoryEn).ThenBy(x => x.NameEn)
            .Select(x => new CatalogListItemViewModel
            {
                Id = x.Id,
                Slug = x.Slug,
                NameEn = x.NameEn,
                NameAr = x.NameAr,
                CategoryEn = x.CategoryEn,
                CategoryAr = x.CategoryAr,
                PrimaryImagePath = !string.IsNullOrWhiteSpace(x.ThumbnailImagePath) ? x.ThumbnailImagePath : x.PrimaryImagePath,
                Price = x.Price,
                Currency = x.Currency,
                IsVerified = x.IsVerified,
                IsActive = x.IsActive,
                SourceDocumentReference = x.SourceDocumentReference,
                LastVerifiedAtUtc = x.LastVerifiedAtUtc,
                Code = x.PicoCode
            }).ToListAsync(cancellationToken);

    public Task<CatalogItem?> GetBySlugAsync(string slug, CancellationToken cancellationToken) =>
        dbContext.CatalogItems.Include(x => x.GalleryImages).FirstOrDefaultAsync(x => x.Slug == slug, cancellationToken);

    public Task<CatalogItem?> GetByIdAsync(int id, CancellationToken cancellationToken) =>
        dbContext.CatalogItems.Include(x => x.GalleryImages).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public async Task<CatalogItem> CreateCatalogItemAsync(CatalogItem item, CancellationToken cancellationToken)
    {
        NormalizeItem(item);
        item.ImportedAtUtc = DateTime.UtcNow;
        item.LastVerifiedAtUtc = item.IsVerified ? DateTime.UtcNow : null;
        item.SortOrder = item.SortOrder == 0
            ? (await dbContext.CatalogItems.MaxAsync(x => (int?)x.SortOrder, cancellationToken) ?? 0) + 10
            : item.SortOrder;
        item.Slug = await BuildUniqueSlugAsync(item.NameEn, item.PicoCode, cancellationToken);

        dbContext.CatalogItems.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        return item;
    }

    public async Task UpdateCatalogItemAsync(CatalogItem item, CancellationToken cancellationToken)
    {
        NormalizeItem(item);
        item.Slug = await BuildUniqueSlugAsync(item.NameEn, item.PicoCode, cancellationToken, item.Id);
        item.LastVerifiedAtUtc = item.IsVerified ? DateTime.UtcNow : item.LastVerifiedAtUtc;
        dbContext.CatalogItems.Update(item);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static void NormalizeItem(CatalogItem item)
    {
        item.NameEn = (item.NameEn ?? string.Empty).Trim();
        item.NameAr = (item.NameAr ?? string.Empty).Trim();
        item.CategoryEn = (item.CategoryEn ?? string.Empty).Trim();
        item.CategoryAr = (item.CategoryAr ?? string.Empty).Trim();
        item.DescriptionEn = (item.DescriptionEn ?? string.Empty).Trim();
        item.DescriptionAr = (item.DescriptionAr ?? string.Empty).Trim();
        item.DimensionsAndSpecsEn = (item.DimensionsAndSpecsEn ?? string.Empty).Trim();
        item.DimensionsAndSpecsAr = (item.DimensionsAndSpecsAr ?? string.Empty).Trim();
        item.PrimaryImagePath = (item.PrimaryImagePath ?? string.Empty).Trim();
        item.OriginalImagePath = string.IsNullOrWhiteSpace(item.OriginalImagePath) ? item.PrimaryImagePath : item.OriginalImagePath.Trim();
        item.CardImagePath = string.IsNullOrWhiteSpace(item.CardImagePath) ? item.PrimaryImagePath : item.CardImagePath.Trim();
        item.DetailImagePath = string.IsNullOrWhiteSpace(item.DetailImagePath) ? item.PrimaryImagePath : item.DetailImagePath.Trim();
        item.ThumbnailImagePath = string.IsNullOrWhiteSpace(item.ThumbnailImagePath) ? item.PrimaryImagePath : item.ThumbnailImagePath.Trim();
        item.Currency = string.IsNullOrWhiteSpace(item.Currency) ? "BHD" : item.Currency.Trim().ToUpperInvariant();
        item.PicoCode = (item.PicoCode ?? string.Empty).Trim();
        item.SourceItemId = (item.SourceItemId ?? string.Empty).Trim();
        item.SourceDocumentReference = (item.SourceDocumentReference ?? string.Empty).Trim();
        item.PriceSourceReference = (item.PriceSourceReference ?? string.Empty).Trim();
    }

    private async Task<string> BuildUniqueSlugAsync(string name, string code, CancellationToken cancellationToken, int? currentId = null)
    {
        var baseSlug = Slugify(string.IsNullOrWhiteSpace(name) ? code : $"{name} {code}");
        var slug = string.IsNullOrWhiteSpace(baseSlug) ? $"item-{Guid.NewGuid():N}"[..13] : baseSlug;
        var suffix = 2;

        while (await dbContext.CatalogItems.AnyAsync(
                   x => x.Slug == slug && (!currentId.HasValue || x.Id != currentId.Value),
                   cancellationToken))
        {
            slug = $"{baseSlug}-{suffix}";
            suffix++;
        }

        return slug;
    }

    private static string Slugify(string value)
    {
        var builder = new StringBuilder();
        var previousDash = false;

        foreach (var character in value.ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(character))
            {
                builder.Append(character);
                previousDash = false;
                continue;
            }

            if (previousDash)
            {
                continue;
            }

            builder.Append('-');
            previousDash = true;
        }

        return builder.ToString().Trim('-');
    }
}
