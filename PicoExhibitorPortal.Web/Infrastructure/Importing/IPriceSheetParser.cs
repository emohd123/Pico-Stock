namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public interface IPriceSheetParser
{
    IReadOnlyList<PriceSheetEntry> Parse(string pdfPath);
}
