namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public sealed class PortalSettingsView
{
    public string InternalRecipients { get; init; } = string.Empty;
    public string CcRecipients { get; init; } = string.Empty;
    public string PptxSourcePath { get; init; } = string.Empty;
    public string PdfSourcePath { get; init; } = string.Empty;
    public string Currency { get; init; } = "BHD";
}
