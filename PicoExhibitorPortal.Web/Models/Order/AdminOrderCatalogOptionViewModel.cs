namespace PicoExhibitorPortal.Web.Models.Order;

public sealed class AdminOrderCatalogOptionViewModel
{
    public int Id { get; set; }
    public string Text { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ImagePath { get; set; } = string.Empty;
    public decimal Price { get; set; }
}
