namespace PicoExhibitorPortal.Web.Domain;

public sealed class ImportBatchItem
{
    public int Id { get; set; }
    public int ImportBatchId { get; set; }
    public ImportBatch ImportBatch { get; set; } = null!;
    public string SourceItemId { get; set; } = string.Empty;
    public string PicoCode { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string NameAr { get; set; } = string.Empty;
    public string DescriptionEn { get; set; } = string.Empty;
    public string DescriptionAr { get; set; } = string.Empty;
    public string SpecsEn { get; set; } = string.Empty;
    public string SpecsAr { get; set; } = string.Empty;
    public string OriginalImagePath { get; set; } = string.Empty;
    public string PrimaryImagePath { get; set; } = string.Empty;
    public string CardImagePath { get; set; } = string.Empty;
    public string DetailImagePath { get; set; } = string.Empty;
    public string ThumbnailImagePath { get; set; } = string.Empty;
    public decimal? SuggestedPrice { get; set; }
    public string Currency { get; set; } = "BHD";
    public string PriceSourceReference { get; set; } = string.Empty;
    public string PriceMatchMethod { get; set; } = string.Empty;
    public string Warning { get; set; } = string.Empty;
    public bool IsMatchedToCatalog { get; set; }
}
