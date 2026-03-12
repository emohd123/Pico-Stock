using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace PicoExhibitorPortal.Web.Infrastructure.Catalog;

public sealed class ImageVariantService(IWebHostEnvironment environment) : IImageVariantService
{
    private const string VariantVersion = "hd2";

    public async Task<ImageVariantSet> ProcessAsync(string sourceRelativePath, int batchId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sourceRelativePath))
        {
            return new ImageVariantSet();
        }

        var sourcePhysical = MapToPhysicalPath(sourceRelativePath);
        if (!File.Exists(sourcePhysical))
        {
            return new ImageVariantSet
            {
                OriginalPath = sourceRelativePath,
                PrimaryPath = sourceRelativePath,
                CardPath = sourceRelativePath,
                DetailPath = sourceRelativePath,
                ThumbnailPath = sourceRelativePath
            };
        }

        var derivedFolder = Path.Combine(environment.WebRootPath, "uploads", "derived", batchId.ToString());
        Directory.CreateDirectory(derivedFolder);

        var fileBase = Path.GetFileNameWithoutExtension(sourcePhysical);
        var detailPath = Path.Combine(derivedFolder, $"{fileBase}-detail-{VariantVersion}.png");
        var cardPath = Path.Combine(derivedFolder, $"{fileBase}-card-{VariantVersion}.png");
        var thumbPath = Path.Combine(derivedFolder, $"{fileBase}-thumb-{VariantVersion}.png");

        await using (var sourceStream = File.OpenRead(sourcePhysical))
        using (var source = await Image.LoadAsync<Rgba32>(sourceStream, cancellationToken))
        {
            await CreateVariantAsync(source, detailPath, 2200, 1800, cancellationToken);
            await CreateVariantAsync(source, cardPath, 1400, 1120, cancellationToken);
            await CreateVariantAsync(source, thumbPath, 640, 640, cancellationToken);
        }

        return new ImageVariantSet
        {
            OriginalPath = sourceRelativePath,
            PrimaryPath = ToRelativeWebPath(detailPath),
            CardPath = ToRelativeWebPath(cardPath),
            DetailPath = ToRelativeWebPath(detailPath),
            ThumbnailPath = ToRelativeWebPath(thumbPath)
        };
    }

    private static async Task CreateVariantAsync(Image<Rgba32> source, string destinationPath, int width, int height, CancellationToken cancellationToken)
    {
        using var clone = source.Clone(context =>
        {
            context.AutoOrient();
            context.Resize(new ResizeOptions
            {
                Mode = ResizeMode.Pad,
                Position = AnchorPositionMode.Center,
                Size = new Size(width, height),
                Sampler = KnownResamplers.Lanczos3,
                PadColor = SixLabors.ImageSharp.Color.Transparent,
                Compand = true
            });
            context.GaussianSharpen(1.1f);
            context.Contrast(1.08f);
            context.Saturate(1.03f);
        });

        await clone.SaveAsPngAsync(destinationPath, new PngEncoder
        {
            ColorType = PngColorType.RgbWithAlpha,
            CompressionLevel = PngCompressionLevel.BestCompression
        }, cancellationToken);
    }

    private string MapToPhysicalPath(string relativePath)
    {
        var trimmed = relativePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        return Path.Combine(environment.WebRootPath, trimmed);
    }

    private string ToRelativeWebPath(string physicalPath)
    {
        var relative = Path.GetRelativePath(environment.WebRootPath, physicalPath).Replace('\\', '/');
        return "/" + relative;
    }
}
