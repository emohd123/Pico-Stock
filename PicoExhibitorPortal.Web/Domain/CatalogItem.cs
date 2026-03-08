namespace PicoExhibitorPortal.Web.Domain;

public sealed class CatalogItem
{
    public int Id { get; set; }
    public string SourceItemId { get; set; } = string.Empty;
    public string PicoCode { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string NameAr { get; set; } = string.Empty;
    public string DescriptionEn { get; set; } = string.Empty;
    public string DescriptionAr { get; set; } = string.Empty;
    public string CategoryEn { get; set; } = string.Empty;
    public string CategoryAr { get; set; } = string.Empty;
    public string DimensionsAndSpecsEn { get; set; } = string.Empty;
    public string DimensionsAndSpecsAr { get; set; } = string.Empty;
    public string OriginalImagePath { get; set; } = string.Empty;
    public string PrimaryImagePath { get; set; } = string.Empty;
    public string CardImagePath { get; set; } = string.Empty;
    public string DetailImagePath { get; set; } = string.Empty;
    public string ThumbnailImagePath { get; set; } = string.Empty;
    public decimal? Price { get; set; }
    public string Currency { get; set; } = "BHD";
    public bool IsActive { get; set; }
    public bool IsVerified { get; set; }
    public int SortOrder { get; set; }
    public string SourceDocumentReference { get; set; } = string.Empty;
    public string PriceSourceReference { get; set; } = string.Empty;
    public DateTime ImportedAtUtc { get; set; }
    public DateTime? LastVerifiedAtUtc { get; set; }
    public ICollection<CatalogItemImage> GalleryImages { get; set; } = new List<CatalogItemImage>();
}
