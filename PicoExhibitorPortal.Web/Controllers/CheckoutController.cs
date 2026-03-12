using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Orders;
using PicoExhibitorPortal.Web.Infrastructure.Session;
using PicoExhibitorPortal.Web.Models.Checkout;

namespace PicoExhibitorPortal.Web.Controllers;

public sealed class CheckoutController(ICartService cartService, IOrderService orderService) : Controller
{
    public async Task<IActionResult> Index(CancellationToken cancellationToken)
    {
        var cart = await cartService.GetCartAsync(cancellationToken);
        return View(new CheckoutViewModel { Cart = cart });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Index(CheckoutViewModel model, CancellationToken cancellationToken)
    {
        model.Cart = await cartService.GetCartAsync(cancellationToken);
        if (model.Cart.Lines.Count == 0)
        {
            ModelState.AddModelError(string.Empty, "Cart is empty.");
        }

        if (!ModelState.IsValid)
        {
            return View(model);
        }

        var result = await orderService.PlaceOrderAsync(new OrderPlacementRequest { Checkout = model }, cancellationToken);
        return RedirectToAction("Details", "Order", new { publicReference = result.PublicReference });
    }
}
