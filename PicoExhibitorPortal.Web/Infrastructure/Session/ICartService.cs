using PicoExhibitorPortal.Web.Models.Cart;

namespace PicoExhibitorPortal.Web.Infrastructure.Session;

public interface ICartService
{
    Task AddAsync(int catalogItemId, int quantity, CancellationToken cancellationToken);
    Task UpdateAsync(int catalogItemId, int quantity, CancellationToken cancellationToken);
    Task RemoveAsync(int catalogItemId, CancellationToken cancellationToken);
    Task ClearAsync(CancellationToken cancellationToken);
    Task<CartViewModel> GetCartAsync(CancellationToken cancellationToken);
}
