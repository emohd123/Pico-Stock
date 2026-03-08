using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Session;

namespace PicoExhibitorPortal.Web.Controllers;

public sealed class CartController(ICartService cartService) : Controller
{
    public async Task<IActionResult> Index(CancellationToken cancellationToken) =>
        View(await cartService.GetCartAsync(cancellationToken));

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Add(int catalogItemId, CancellationToken cancellationToken, int quantity = 1)
    {
        await cartService.AddAsync(catalogItemId, quantity, cancellationToken);
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Update(int catalogItemId, int quantity, CancellationToken cancellationToken)
    {
        await cartService.UpdateAsync(catalogItemId, quantity, cancellationToken);
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Remove(int catalogItemId, CancellationToken cancellationToken)
    {
        await cartService.RemoveAsync(catalogItemId, cancellationToken);
        return RedirectToAction(nameof(Index));
    }
}
