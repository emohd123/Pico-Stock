using System.IO.Compression;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;
using PicoExhibitorPortal.Web.Infrastructure.Importing;
using PicoExhibitorPortal.Web.Infrastructure.Orders;

namespace PicoExhibitorPortal.Tests;

public sealed class CatalogImportServiceTests
{
    [Fact]
    public async Task ParsePptxAsyncUsesAuthoritativeRateMatchAndVariants()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var webRoot = Path.Combine(root, "wwwroot");
            Directory.CreateDirectory(webRoot);
            var pptxPath = Path.Combine(root, "sample.pptx");
            CreateSamplePptx(pptxPath);

            await using var db = BuildDb();
            var imageVariants = new FakeImageVariantService();
            var service = new CatalogImportService(
                db,
                new FakeSettingsService(),
                new FakeHostEnvironment(webRoot),
                new FakePriceSheetParser(),
                imageVariants,
                NullLogger<CatalogImportService>.Instance);

            var byId = new Dictionary<string, PriceSheetEntry>
            {
                ["1530"] = new() { SourceItemId = "1530", PicoCode = "FVCHBLU1", UnitRate = 0.500m, SourceReference = "rates.pdf:page-5:row-364" }
            };

            var records = await service.ParsePptxAsync(1, pptxPath, "BHD", byId, new Dictionary<string, PriceSheetEntry>(), CancellationToken.None);

            var record = Assert.Single(records);
            Assert.Equal("Stackable Chairs", record.CategoryEn);
            Assert.Equal("FVCHBLU1", record.PicoCode);
            Assert.Equal(0.500m, record.SuggestedPrice);
            Assert.Equal("rates.pdf:page-5:row-364", record.PriceSourceReference);
            Assert.Equal("SourceItemId", record.PriceMatchMethod);
            Assert.StartsWith("/uploads/derived/1/", record.CardImagePath, StringComparison.Ordinal);
            Assert.Equal(1, imageVariants.Calls);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, true);
            }
        }
    }

    private static PortalDbContext BuildDb()
    {
        var options = new DbContextOptionsBuilder<PortalDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new PortalDbContext(options);
    }

    private static void CreateSamplePptx(string path)
    {
        using var archive = ZipFile.Open(path, ZipArchiveMode.Create);
        AddEntry(archive, "ppt/slides/slide1.xml",
            """
            <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <p:cSld><p:spTree>
                <p:sp><p:txBody>
                  <a:p><a:r><a:t>STACKABLE CHAIRS</a:t></a:r></a:p>
                  <a:p><a:r><a:t>ID 1530 FVCHBLU1 [144] Polypropylene Seat Blue H79*D47*W51cm</a:t></a:r></a:p>
                </p:txBody></p:sp>
              </p:spTree></p:cSld>
            </p:sld>
            """);
        AddEntry(archive, "ppt/slides/_rels/slide1.xml.rels",
            """
            <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
              <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpg" />
            </Relationships>
            """);
        using var stream = archive.CreateEntry("ppt/media/image1.jpg").Open();
        stream.Write([0xFF, 0xD8, 0xFF, 0xD9]);
    }

    private static void AddEntry(ZipArchive archive, string name, string content)
    {
        using var writer = new StreamWriter(archive.CreateEntry(name).Open());
        writer.Write(content);
    }

    private sealed class FakePriceSheetParser : IPriceSheetParser
    {
        public IReadOnlyList<PriceSheetEntry> Parse(string pdfPath) => [];
    }

    private sealed class FakeImageVariantService : IImageVariantService
    {
        public int Calls { get; private set; }

        public Task<ImageVariantSet> ProcessAsync(string sourceRelativePath, int batchId, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(new ImageVariantSet
            {
                OriginalPath = sourceRelativePath,
                PrimaryPath = $"/uploads/derived/{batchId}/primary.jpg",
                CardPath = $"/uploads/derived/{batchId}/card.jpg",
                DetailPath = $"/uploads/derived/{batchId}/detail.jpg",
                ThumbnailPath = $"/uploads/derived/{batchId}/thumb.jpg"
            });
        }
    }

    private sealed class FakeSettingsService : IPortalSettingsService
    {
        public Task<PortalSettingsView> GetAsync(CancellationToken cancellationToken) => Task.FromResult(new PortalSettingsView());
        public Task SaveAsync(PortalSettingsView settings, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class FakeHostEnvironment(string webRootPath) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Tests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = webRootPath;
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = webRootPath;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
