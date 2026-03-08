using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Orders;
using PicoExhibitorPortal.Web.Models.Order;

namespace PicoExhibitorPortal.Web.Controllers;

public sealed class OrderController(IOrderService orderService) : Controller
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
        if (order is null || string.IsNullOrWhiteSpace(order.PdfPath) || !System.IO.File.Exists(order.PdfPath))
        {
            return NotFound();
        }

        return PhysicalFile(order.PdfPath, "application/pdf", Path.GetFileName(order.PdfPath));
    }
}
