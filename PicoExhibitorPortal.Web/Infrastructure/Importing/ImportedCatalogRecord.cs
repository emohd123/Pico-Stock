namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public sealed class ImportedCatalogRecord
{
    public string SourceItemId { get; init; } = string.Empty;
    public string PicoCode { get; init; } = string.Empty;
    public string CategoryEn { get; init; } = string.Empty;
    public string CategoryAr { get; init; } = string.Empty;
    public string NameEn { get; init; } = string.Empty;
    public string NameAr { get; init; } = string.Empty;
    public string DescriptionEn { get; init; } = string.Empty;
    public string DescriptionAr { get; init; } = string.Empty;
    public string SpecsEn { get; init; } = string.Empty;
    public string SpecsAr { get; init; } = string.Empty;
    public string OriginalImagePath { get; init; } = string.Empty;
    public decimal? SuggestedPrice { get; init; }
    public string Currency { get; init; } = "BHD";
    public string SourceReference { get; init; } = string.Empty;
    public string PrimaryImagePath { get; init; } = string.Empty;
    public string CardImagePath { get; init; } = string.Empty;
    public string DetailImagePath { get; init; } = string.Empty;
    public string ThumbnailImagePath { get; init; } = string.Empty;
    public string PriceSourceReference { get; init; } = string.Empty;
    public string PriceMatchMethod { get; init; } = string.Empty;
    public List<string> GalleryImages { get; init; } = [];
    public string Warning { get; init; } = string.Empty;
}
