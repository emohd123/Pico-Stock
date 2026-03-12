using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Models.Cart;

namespace PicoExhibitorPortal.Web.Infrastructure.Session;

public sealed class SessionCartService(IHttpContextAccessor accessor, PortalDbContext dbContext) : ICartService
{
    private const string CartKey = "pico-cart";

    public Task AddAsync(int catalogItemId, int quantity, CancellationToken cancellationToken)
    {
        var items = GetStoredItems();
        var existing = items.FirstOrDefault(x => x.CatalogItemId == catalogItemId);
        if (existing is null)
        {
            items.Add(new CartItem { CatalogItemId = catalogItemId, Quantity = Math.Max(1, quantity) });
        }
        else
        {
            existing.Quantity += Math.Max(1, quantity);
        }

        Save(items);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(int catalogItemId, int quantity, CancellationToken cancellationToken)
    {
        var items = GetStoredItems();
        var existing = items.FirstOrDefault(x => x.CatalogItemId == catalogItemId);
        if (existing is null)
        {
            return Task.CompletedTask;
        }

        if (quantity <= 0)
        {
            items.Remove(existing);
        }
        else
        {
            existing.Quantity = quantity;
        }

        Save(items);
        return Task.CompletedTask;
    }

    public Task RemoveAsync(int catalogItemId, CancellationToken cancellationToken)
    {
        var items = GetStoredItems();
        items.RemoveAll(x => x.CatalogItemId == catalogItemId);
        Save(items);
        return Task.CompletedTask;
    }

    public Task ClearAsync(CancellationToken cancellationToken)
    {
        accessor.HttpContext?.Session.Remove(CartKey);
        return Task.CompletedTask;
    }

    public async Task<CartViewModel> GetCartAsync(CancellationToken cancellationToken)
    {
        var storedItems = GetStoredItems();
        var ids = storedItems.Select(x => x.CatalogItemId).ToArray();
        var items = await dbContext.CatalogItems.AsNoTracking().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, cancellationToken);
        var lines = storedItems.Where(x => items.ContainsKey(x.CatalogItemId)).Select(x =>
        {
            var item = items[x.CatalogItemId];
            var price = item.Price ?? 0m;
            return new CartLineViewModel
            {
                CatalogItemId = item.Id,
                NameEn = item.NameEn,
                NameAr = item.NameAr,
                Code = item.PicoCode,
                ImagePath = !string.IsNullOrWhiteSpace(item.ThumbnailImagePath) ? item.ThumbnailImagePath : item.PrimaryImagePath,
                Quantity = x.Quantity,
                UnitPrice = price,
                LineTotal = price * x.Quantity,
                Currency = item.Currency,
                IsOrderable = item.IsActive && item.IsVerified && item.Price.HasValue
            };
        }).ToList();

        return new CartViewModel
        {
            Lines = lines,
            Currency = lines.FirstOrDefault()?.Currency ?? "BHD",
            Total = lines.Sum(x => x.LineTotal)
        };
    }

    private List<CartItem> GetStoredItems()
    {
        var json = accessor.HttpContext?.Session.GetString(CartKey);
        return string.IsNullOrWhiteSpace(json) ? [] : JsonSerializer.Deserialize<List<CartItem>>(json) ?? [];
    }

    private void Save(List<CartItem> items) =>
        accessor.HttpContext?.Session.SetString(CartKey, JsonSerializer.Serialize(items));
}
