namespace PicoExhibitorPortal.Web.Models.Cart;

public sealed class CartLineViewModel
{
    public int CatalogItemId { get; set; }
    public string NameEn { get; set; } = string.Empty;
    public string NameAr { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string ImagePath { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
    public string Currency { get; set; } = "BHD";
    public bool IsOrderable { get; set; }
}
