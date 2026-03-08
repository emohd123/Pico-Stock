using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Importing;

namespace PicoExhibitorPortal.Web.Areas.Admin.Controllers;

[Area("Admin")]
public sealed class ImportsController(ICatalogImportService importService) : Controller
{
    public async Task<IActionResult> Index(CancellationToken cancellationToken) =>
        View(await importService.GetBatchesAsync(cancellationToken));

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Run(CancellationToken cancellationToken)
    {
        await importService.RunConfiguredImportAsync(cancellationToken);
        return RedirectToAction(nameof(Index));
    }
}
