namespace PicoExhibitorPortal.Web.Models.Catalog;

public sealed class CatalogIndexViewModel
{
    public string? ActiveCategory { get; set; }
    public List<string> Categories { get; set; } = [];
    public IReadOnlyList<CatalogListItemViewModel> Items { get; set; } = [];
}
