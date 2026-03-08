namespace PicoExhibitorPortal.Web.Domain;

public sealed class CatalogItemImage
{
    public int Id { get; set; }
    public int CatalogItemId { get; set; }
    public CatalogItem CatalogItem { get; set; } = null!;
    public string ImagePath { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsPrimary { get; set; }
}
