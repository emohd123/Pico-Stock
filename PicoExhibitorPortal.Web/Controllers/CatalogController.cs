using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;
using PicoExhibitorPortal.Web.Models.Catalog;

namespace PicoExhibitorPortal.Web.Controllers;

public sealed class CatalogController(ICatalogService catalogService) : Controller
{
    public async Task<IActionResult> Index(string? category, CancellationToken cancellationToken)
    {
        var items = await catalogService.GetVisibleCatalogAsync(category, cancellationToken);
        var allItems = await catalogService.GetVisibleCatalogAsync(null, cancellationToken);
        return View(new CatalogIndexViewModel
        {
            ActiveCategory = category,
            Items = items,
            Categories = allItems.Select(x => x.CategoryEn).Distinct().Order().ToList()
        });
    }

    [Route("/item/{slug}")]
    public async Task<IActionResult> Item(string slug, CancellationToken cancellationToken)
    {
        var item = await catalogService.GetBySlugAsync(slug, cancellationToken);
        return item is null ? NotFound() : View(new CatalogDetailViewModel { Item = item });
    }
}
