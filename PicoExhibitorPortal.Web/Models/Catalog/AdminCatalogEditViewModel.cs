using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Http;

namespace PicoExhibitorPortal.Web.Models.Catalog;

public sealed class AdminCatalogEditViewModel
{
    public int Id { get; set; }
    [Required]
    public string NameEn { get; set; } = string.Empty;
    public string NameAr { get; set; } = string.Empty;
    [Required]
    public string CategoryEn { get; set; } = string.Empty;
    public string CategoryAr { get; set; } = string.Empty;
    public string DescriptionEn { get; set; } = string.Empty;
    public string DescriptionAr { get; set; } = string.Empty;
    public string DimensionsAndSpecsEn { get; set; } = string.Empty;
    public string DimensionsAndSpecsAr { get; set; } = string.Empty;
    public string PrimaryImagePath { get; set; } = string.Empty;
    public IFormFile? ImageUpload { get; set; }
    public decimal? Price { get; set; }
    [Required]
    public string Currency { get; set; } = "BHD";
    public bool IsActive { get; set; }
    public bool IsVerified { get; set; }
    public string PicoCode { get; set; } = string.Empty;
    public string SourceItemId { get; set; } = string.Empty;
    public string SourceDocumentReference { get; set; } = string.Empty;
}
