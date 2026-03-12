namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public sealed class OrderPlacementResult
{
    public required string PublicReference { get; init; }
    public required int OrderId { get; init; }
    public string EmailDeliveryStatus { get; init; } = string.Empty;
    public string EmailDeliveryError { get; init; } = string.Empty;
}
