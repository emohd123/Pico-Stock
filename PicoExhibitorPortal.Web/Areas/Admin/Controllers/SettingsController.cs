using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Orders;
using PicoExhibitorPortal.Web.Models.Order;

namespace PicoExhibitorPortal.Web.Areas.Admin.Controllers;

[Area("Admin")]
public sealed class SettingsController(IPortalSettingsService settingsService) : Controller
{
    public async Task<IActionResult> Index(CancellationToken cancellationToken)
    {
        var settings = await settingsService.GetAsync(cancellationToken);
        return View(new AdminSettingsViewModel
        {
            InternalRecipients = settings.InternalRecipients,
            CcRecipients = settings.CcRecipients,
            PptxSourcePath = settings.PptxSourcePath,
            PdfSourcePath = settings.PdfSourcePath,
            Currency = settings.Currency
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Index(AdminSettingsViewModel model, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return View(model);
        }

        await settingsService.SaveAsync(new PortalSettingsView
        {
            InternalRecipients = model.InternalRecipients,
            CcRecipients = model.CcRecipients,
            PptxSourcePath = model.PptxSourcePath,
            PdfSourcePath = model.PdfSourcePath,
            Currency = model.Currency
        }, cancellationToken);

        ViewData["Saved"] = true;
        return View(model);
    }
}
