using PicoExhibitorPortal.Web.Models.Checkout;

namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public sealed class OrderPlacementRequest
{
    public required CheckoutViewModel Checkout { get; init; }
}
