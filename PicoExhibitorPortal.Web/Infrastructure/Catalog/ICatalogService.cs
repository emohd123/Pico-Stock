using PicoExhibitorPortal.Web.Domain;
using PicoExhibitorPortal.Web.Models.Catalog;

namespace PicoExhibitorPortal.Web.Infrastructure.Catalog;

public interface ICatalogService
{
    Task<IReadOnlyList<CatalogListItemViewModel>> GetVisibleCatalogAsync(string? category, CancellationToken cancellationToken);
    Task<IReadOnlyList<CatalogListItemViewModel>> GetAdminCatalogAsync(CancellationToken cancellationToken);
    Task<CatalogItem?> GetBySlugAsync(string slug, CancellationToken cancellationToken);
    Task<CatalogItem?> GetByIdAsync(int id, CancellationToken cancellationToken);
    Task<CatalogItem> CreateCatalogItemAsync(CatalogItem item, CancellationToken cancellationToken);
    Task UpdateCatalogItemAsync(CatalogItem item, CancellationToken cancellationToken);
}
