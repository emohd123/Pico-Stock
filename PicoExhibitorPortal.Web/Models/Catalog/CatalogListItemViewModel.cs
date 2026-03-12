namespace PicoExhibitorPortal.Web.Models.Catalog;

public sealed class CatalogListItemViewModel
{
    public int Id { get; set; }
    public string Slug { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string NameAr { get; set; } = string.Empty;
    public string CategoryEn { get; set; } = string.Empty;
    public string CategoryAr { get; set; } = string.Empty;
    public string PrimaryImagePath { get; set; } = string.Empty;
    public decimal? Price { get; set; }
    public string Currency { get; set; } = "BHD";
    public bool IsVerified { get; set; }
    public bool IsActive { get; set; }
    public string SourceDocumentReference { get; set; } = string.Empty;
    public DateTime? LastVerifiedAtUtc { get; set; }
    public string Code { get; set; } = string.Empty;
}
