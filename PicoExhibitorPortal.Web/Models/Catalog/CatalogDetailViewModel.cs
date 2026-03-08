using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Models.Catalog;

public sealed class CatalogDetailViewModel
{
    public required CatalogItem Item { get; init; }
    public bool IsOrderable => Item.IsActive && Item.IsVerified && Item.Price.HasValue;
}
