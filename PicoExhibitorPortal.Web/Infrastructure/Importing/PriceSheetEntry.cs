namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public sealed class PriceSheetEntry
{
    public string SourceItemId { get; init; } = string.Empty;
    public string PicoCode { get; init; } = string.Empty;
    public decimal UnitRate { get; init; }
    public string SourceReference { get; init; } = string.Empty;
}
