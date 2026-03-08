using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc.Rendering;
using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Models.Order;

public sealed class AdminOrderEditViewModel
{
    public int Id { get; set; }
    public string PublicReference { get; set; } = string.Empty;

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

    public string Notes { get; set; } = string.Empty;

    [Required]
    public string Status { get; set; } = OrderStatuses.New;

    public string Currency { get; set; } = "BHD";
    public DateTime SubmittedAtUtc { get; set; }
    public string EmailDeliveryStatus { get; set; } = string.Empty;
    public string EmailDeliveryError { get; set; } = string.Empty;
    public string PdfPath { get; set; } = string.Empty;
    public List<SelectListItem> StatusOptions { get; set; } = [];
    public List<SelectListItem> CatalogItemOptions { get; set; } = [];
    public List<AdminOrderCatalogOptionViewModel> CatalogItems { get; set; } = [];
    public List<AdminOrderLineEditViewModel> Lines { get; set; } = [];
    public decimal GrandTotal => Lines.Sum(x => x.LineTotal);
}
