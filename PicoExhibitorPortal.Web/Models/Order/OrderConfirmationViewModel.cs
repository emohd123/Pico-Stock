using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Models.Order;

public sealed class OrderConfirmationViewModel
{
    public required PicoExhibitorPortal.Web.Domain.Order Order { get; init; }
}
