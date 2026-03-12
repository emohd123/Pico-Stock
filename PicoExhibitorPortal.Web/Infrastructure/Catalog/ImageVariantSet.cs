namespace PicoExhibitorPortal.Web.Infrastructure.Catalog;

public sealed class ImageVariantSet
{
    public string OriginalPath { get; init; } = string.Empty;
    public string PrimaryPath { get; init; } = string.Empty;
    public string CardPath { get; init; } = string.Empty;
    public string DetailPath { get; init; } = string.Empty;
    public string ThumbnailPath { get; init; } = string.Empty;
}
