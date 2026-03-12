namespace PicoExhibitorPortal.Web.Models.Cart;

public sealed class CartViewModel
{
    public List<CartLineViewModel> Lines { get; set; } = [];
    public decimal Total { get; set; }
    public string Currency { get; set; } = "BHD";
}
