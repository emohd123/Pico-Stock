namespace PicoExhibitorPortal.Web.Domain;

public sealed class OrderLine
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public int? CatalogItemId { get; set; }
    public string ItemNameEn { get; set; } = string.Empty;
    public string ItemNameAr { get; set; } = string.Empty;
    public string ItemCode { get; set; } = string.Empty;
    public string ItemImagePath { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
}
