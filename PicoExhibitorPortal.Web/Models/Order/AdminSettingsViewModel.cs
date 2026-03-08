using System.ComponentModel.DataAnnotations;

namespace PicoExhibitorPortal.Web.Models.Order;

public sealed class AdminSettingsViewModel
{
    [Required]
    public string InternalRecipients { get; set; } = string.Empty;
    public string CcRecipients { get; set; } = string.Empty;
    [Required]
    public string PptxSourcePath { get; set; } = string.Empty;
    public string PdfSourcePath { get; set; } = string.Empty;
    [Required]
    public string Currency { get; set; } = "BHD";
}
