namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public sealed class AdminOrderUpdateLineRequest
{
    public int? LineId { get; set; }
    public int CatalogItemId { get; set; }
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
}
