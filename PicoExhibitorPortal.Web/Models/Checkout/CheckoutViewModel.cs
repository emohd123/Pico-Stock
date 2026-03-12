using System.ComponentModel.DataAnnotations;
using PicoExhibitorPortal.Web.Models.Cart;

namespace PicoExhibitorPortal.Web.Models.Checkout;

public sealed class CheckoutViewModel
{
    [Required]
    public string ExhibitionName { get; set; } = string.Empty;
    [Required]
    public string ExhibitorCompany { get; set; } = string.Empty;
    [Required]
    public string BoothNumber { get; set; } = string.Empty;
    [Required]
    public string ContactPerson { get; set; } = string.Empty;
    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;
    [Required]
    public string Phone { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public CartViewModel Cart { get; set; } = new();
}
