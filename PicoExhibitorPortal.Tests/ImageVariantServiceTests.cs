using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace PicoExhibitorPortal.Tests;

public sealed class ImageVariantServiceTests
{
    [Fact]
    public async Task ProcessAsyncCreatesDerivativeFiles()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var webRoot = Path.Combine(root, "wwwroot");
            var importFolder = Path.Combine(webRoot, "uploads", "imports", "1");
            Directory.CreateDirectory(importFolder);
            var sourcePath = Path.Combine(importFolder, "sample.jpg");

            using (var image = new Image<Rgba32>(120, 160, new Rgba32(12, 150, 145)))
            {
                await image.SaveAsJpegAsync(sourcePath);
            }

            var service = new ImageVariantService(new FakeHostEnvironment(webRoot));
            var variants = await service.ProcessAsync("/uploads/imports/1/sample.jpg", 1, CancellationToken.None);

            Assert.StartsWith("/uploads/derived/1/", variants.CardPath, StringComparison.Ordinal);
            Assert.True(File.Exists(Path.Combine(webRoot, variants.CardPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))));
            Assert.True(File.Exists(Path.Combine(webRoot, variants.DetailPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))));
            Assert.True(File.Exists(Path.Combine(webRoot, variants.ThumbnailPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, true);
            }
        }
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
