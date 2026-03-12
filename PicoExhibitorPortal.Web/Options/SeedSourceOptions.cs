namespace PicoExhibitorPortal.Web.Options;

public sealed class SeedSourceOptions
{
    public const string SectionName = "SeedSources";

    public string PptxPath { get; set; } = string.Empty;
    public string PdfPath { get; set; } = string.Empty;
    public string DefaultCurrency { get; set; } = "BHD";
}
