using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Orders;
using PicoExhibitorPortal.Web.Models.Order;

namespace PicoExhibitorPortal.Web.Controllers;

public sealed class OrderController(IOrderService orderService, IOrderDocumentService orderDocumentService) : Controller
{
    [Route("/order/{publicReference}")]
    public async Task<IActionResult> Details(string publicReference, CancellationToken cancellationToken)
    {
        var order = await orderService.GetByPublicReferenceAsync(publicReference, cancellationToken);
        return order is null ? NotFound() : View(new OrderConfirmationViewModel { Order = order });
    }

    [Route("/order/{publicReference}/pdf")]
    public async Task<IActionResult> Document(string publicReference, CancellationToken cancellationToken)
    {
        var order = await orderService.GetByPublicReferenceAsync(publicReference, cancellationToken);
        if (order is null || string.IsNullOrWhiteSpace(order.PdfPath))
        {
            return NotFound();
        }

        var pdfPath = order.PdfPath;

        // Regenerate on-demand if the file was lost (e.g. container restarted and wiped the ephemeral filesystem)
        if (!System.IO.File.Exists(pdfPath))
        {
            try
            {
                var result = await orderDocumentService.GenerateAsync(order, cancellationToken);
                pdfPath = result.PhysicalPath;
            }
            catch
            {
                return NotFound();
            }
        }

        if (!System.IO.File.Exists(pdfPath))
        {
            return NotFound();
        }

        return PhysicalFile(pdfPath, "application/pdf", Path.GetFileName(pdfPath));
    }
}
