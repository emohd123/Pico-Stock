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
        TempData["Success"] = "Import completed successfully.";
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(200 * 1024 * 1024)] // 200 MB
    public async Task<IActionResult> Upload(IFormFile pptxFile, IFormFile? pdfFile, CancellationToken cancellationToken)
    {
        if (pptxFile is null || pptxFile.Length == 0)
        {
            TempData["Error"] = "Please select a PPTX file to upload.";
            return RedirectToAction(nameof(Index));
        }

        if (!Path.GetExtension(pptxFile.FileName).Equals(".pptx", StringComparison.OrdinalIgnoreCase))
        {
            TempData["Error"] = "The inventory source must be a .pptx file.";
            return RedirectToAction(nameof(Index));
        }

        if (pdfFile is { Length: > 0 } && !Path.GetExtension(pdfFile.FileName).Equals(".pdf", StringComparison.OrdinalIgnoreCase))
        {
            TempData["Error"] = "The optional rate sheet must be a .pdf file.";
            return RedirectToAction(nameof(Index));
        }

        await using var pptxStream = pptxFile.OpenReadStream();
        Stream? pdfStream = null;
        if (pdfFile is { Length: > 0 })
            pdfStream = pdfFile.OpenReadStream();

        await importService.RunUploadedImportAsync(
            pptxStream, pptxFile.FileName,
            pdfStream, pdfFile?.FileName,
            cancellationToken);

        if (pdfStream is not null)
            await pdfStream.DisposeAsync();

        TempData["Success"] = "Files uploaded and import started successfully.";
        return RedirectToAction(nameof(Index));
    }
}
