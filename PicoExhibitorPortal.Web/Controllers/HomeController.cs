using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;
using PicoExhibitorPortal.Web.Models;
using PicoExhibitorPortal.Web.Models.Catalog;

namespace PicoExhibitorPortal.Web.Controllers;

public sealed class HomeController(ICatalogService catalogService) : Controller
{
    public async Task<IActionResult> Index(CancellationToken cancellationToken)
    {
        var items = await catalogService.GetVisibleCatalogAsync(null, cancellationToken);
        var model = new CatalogIndexViewModel
        {
            Items = items.Take(6).ToList(),
            Categories = items.Select(x => x.CategoryEn).Distinct().Order().ToList()
        };

        return View(model);
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error() => View(new ErrorViewModel { RequestId = HttpContext.TraceIdentifier });
}
