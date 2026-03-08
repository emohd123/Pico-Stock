using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using PicoExhibitorPortal.Web.Domain;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;
using PicoExhibitorPortal.Web.Infrastructure.Orders;
using PicoExhibitorPortal.Web.Models.Order;

namespace PicoExhibitorPortal.Web.Areas.Admin.Controllers;

[Area("Admin")]
public sealed class OrdersController(IOrderService orderService, ICatalogService catalogService) : Controller
{
    public async Task<IActionResult> Index(CancellationToken cancellationToken) =>
        View(await orderService.GetOrdersAsync(cancellationToken));

    public async Task<IActionResult> Details(int id, CancellationToken cancellationToken)
    {
        var order = await orderService.GetByIdAsync(id, cancellationToken);
        return order is null ? NotFound() : View(order);
    }

    public async Task<IActionResult> Edit(int id, CancellationToken cancellationToken)
    {
        var order = await orderService.GetByIdAsync(id, cancellationToken);
        if (order is null)
        {
            return NotFound();
        }

        return View(await BuildEditViewModelAsync(order, cancellationToken));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(AdminOrderEditViewModel model, CancellationToken cancellationToken)
    {
        model.Lines ??= [];
        model.Lines = model.Lines.Where(x => x.CatalogItemId.HasValue && x.Quantity > 0).ToList();

        if (model.Lines.Count == 0)
        {
            ModelState.AddModelError(string.Empty, "At least one order item is required.");
        }

        var catalogItems = await catalogService.GetAdminCatalogAsync(cancellationToken);
        var catalogMap = catalogItems.ToDictionary(x => x.Id);
        foreach (var line in model.Lines)
        {
            if (!line.CatalogItemId.HasValue || !catalogMap.TryGetValue(line.CatalogItemId.Value, out var item))
            {
                ModelState.AddModelError(string.Empty, "One or more selected catalog items could not be found.");
                continue;
            }

            line.ItemNameEn = item.NameEn;
            line.ItemCode = item.Code;
            line.ItemImagePath = item.PrimaryImagePath;
        }

        if (!ModelState.IsValid)
        {
            await PopulateSelectionsAsync(model, cancellationToken);
            return View(model);
        }

        var updated = await orderService.UpdateOrderAsync(new AdminOrderUpdateRequest
        {
            OrderId = model.Id,
            ExhibitionName = model.ExhibitionName,
            ExhibitorCompany = model.ExhibitorCompany,
            BoothNumber = model.BoothNumber,
            ContactPerson = model.ContactPerson,
            Email = model.Email,
            Phone = model.Phone,
            Notes = model.Notes,
            Status = model.Status,
            Currency = model.Currency,
            Lines = model.Lines.Select(x => new AdminOrderUpdateLineRequest
            {
                LineId = x.Id,
                CatalogItemId = x.CatalogItemId!.Value,
                Quantity = x.Quantity,
                UnitPrice = x.UnitPrice
            }).ToList()
        }, cancellationToken);

        if (!updated)
        {
            return NotFound();
        }

        return RedirectToAction(nameof(Details), new { id = model.Id });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var deleted = await orderService.DeleteOrderAsync(id, cancellationToken);
        return deleted ? RedirectToAction(nameof(Index)) : NotFound();
    }

    public async Task<IActionResult> Document(string publicReference, CancellationToken cancellationToken)
    {
        var order = await orderService.GetByPublicReferenceAsync(publicReference, cancellationToken);
        if (order is null || string.IsNullOrWhiteSpace(order.PdfPath) || !System.IO.File.Exists(order.PdfPath))
        {
            return NotFound();
        }

        return PhysicalFile(order.PdfPath, "application/pdf", Path.GetFileName(order.PdfPath));
    }

    private async Task<AdminOrderEditViewModel> BuildEditViewModelAsync(Order order, CancellationToken cancellationToken)
    {
        var model = new AdminOrderEditViewModel
        {
            Id = order.Id,
            PublicReference = order.PublicReference,
            ExhibitionName = order.ExhibitionName,
            ExhibitorCompany = order.ExhibitorCompany,
            BoothNumber = order.BoothNumber,
            ContactPerson = order.ContactPerson,
            Email = order.Email,
            Phone = order.Phone,
            Notes = order.Notes,
            Status = order.Status,
            Currency = order.Currency,
            SubmittedAtUtc = order.SubmittedAtUtc,
            EmailDeliveryStatus = order.EmailDeliveryStatus,
            EmailDeliveryError = order.EmailDeliveryError,
            PdfPath = order.PdfPath,
            Lines = order.Lines.Select(x => new AdminOrderLineEditViewModel
            {
                Id = x.Id,
                CatalogItemId = x.CatalogItemId,
                Quantity = x.Quantity,
                UnitPrice = x.UnitPrice,
                ItemNameEn = x.ItemNameEn,
                ItemCode = x.ItemCode,
                ItemImagePath = x.ItemImagePath
            }).ToList()
        };

        await PopulateSelectionsAsync(model, cancellationToken);
        return model;
    }

    private async Task PopulateSelectionsAsync(AdminOrderEditViewModel model, CancellationToken cancellationToken)
    {
        var catalog = await catalogService.GetAdminCatalogAsync(cancellationToken);
        model.StatusOptions =
        [
            new SelectListItem(OrderStatuses.New, OrderStatuses.New),
            new SelectListItem(OrderStatuses.Reviewing, OrderStatuses.Reviewing),
            new SelectListItem(OrderStatuses.Confirmed, OrderStatuses.Confirmed),
            new SelectListItem(OrderStatuses.Fulfilled, OrderStatuses.Fulfilled),
            new SelectListItem(OrderStatuses.Cancelled, OrderStatuses.Cancelled)
        ];

        model.CatalogItemOptions = catalog.Select(x => new SelectListItem
        {
            Text = $"{x.Code} - {x.NameEn} - {(x.Price?.ToString("0.000") ?? "0.000")} {x.Currency}",
            Value = x.Id.ToString()
        }).ToList();

        model.CatalogItems = catalog.Select(x => new AdminOrderCatalogOptionViewModel
        {
            Id = x.Id,
            Text = $"{x.Code} - {x.NameEn} - {(x.Price?.ToString("0.000") ?? "0.000")} {x.Currency}",
            Code = x.Code,
            Name = x.NameEn,
            ImagePath = x.PrimaryImagePath,
            Price = x.Price ?? 0m
        }).ToList();
    }
}
