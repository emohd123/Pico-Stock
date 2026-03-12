using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public interface IOrderService
{
    Task<OrderPlacementResult> PlaceOrderAsync(OrderPlacementRequest request, CancellationToken cancellationToken);
    Task<Order?> GetByPublicReferenceAsync(string publicReference, CancellationToken cancellationToken);
    Task<Order?> GetByIdAsync(int id, CancellationToken cancellationToken);
    Task<IReadOnlyList<Order>> GetOrdersAsync(CancellationToken cancellationToken);
    Task<bool> UpdateOrderAsync(AdminOrderUpdateRequest request, CancellationToken cancellationToken);
    Task<bool> DeleteOrderAsync(int id, CancellationToken cancellationToken);
}
