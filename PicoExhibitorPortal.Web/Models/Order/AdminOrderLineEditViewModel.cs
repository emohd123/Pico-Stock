using System.ComponentModel.DataAnnotations;

namespace PicoExhibitorPortal.Web.Models.Order;

public sealed class AdminOrderLineEditViewModel
{
    public int? Id { get; set; }

    [Required]
    public int? CatalogItemId { get; set; }

    [Range(1, 9999)]
    public int Quantity { get; set; } = 1;

    [Range(typeof(decimal), "0", "9999999")]
    public decimal UnitPrice { get; set; }

    public string ItemNameEn { get; set; } = string.Empty;
    public string ItemCode { get; set; } = string.Empty;
    public string ItemImagePath { get; set; } = string.Empty;
    public decimal LineTotal => Quantity * UnitPrice;
}
