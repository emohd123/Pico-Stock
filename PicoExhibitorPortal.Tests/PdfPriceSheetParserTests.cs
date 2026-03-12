using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;
using PicoExhibitorPortal.Web.Infrastructure.Importing;

namespace PicoExhibitorPortal.Tests;

public sealed class PdfPriceSheetParserTests
{
    [Fact]
    public void ParseExtractsRateRowsFromPdf()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var pdfPath = Path.Combine(root, "rates.pdf");
            CreatePdf(pdfPath);

            var parser = new PdfPriceSheetParser();
            var entries = parser.Parse(pdfPath);

            Assert.Contains(entries, entry =>
                entry.SourceItemId == "1530"
                && entry.PicoCode == "FVCHBLU1"
                && entry.UnitRate == 0.500m);
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, true);
            }
        }
    }

    [Fact]
    public void ParseReturnsUserSuppliedManualRatesWithoutPdf()
    {
        var parser = new PdfPriceSheetParser();

        var entries = parser.Parse("C:\\missing-rates.pdf");

        Assert.Contains(entries, entry =>
            entry.SourceItemId == "1419"
            && entry.PicoCode == "FHGTBL"
            && entry.UnitRate == 18m
            && entry.SourceReference.Contains(AuthoritativeRateSheetOverrides.SourceTag, StringComparison.Ordinal));
    }

    private static void CreatePdf(string pdfPath)
    {
        var document = new PdfDocument();
        var page = document.AddPage();
        using var gfx = XGraphics.FromPdfPage(page);
        var font = new XFont("Arial", 12);
        gfx.DrawString("RATES", font, XBrushes.Black, new XPoint(50, 50));
        gfx.DrawString("1530", font, XBrushes.Black, new XPoint(140, 180));
        gfx.DrawString("FVCHBLU1", font, XBrushes.Black, new XPoint(190, 180));
        gfx.DrawString("Blue", font, XBrushes.Black, new XPoint(310, 180));
        gfx.DrawString("H79*D47*W51", font, XBrushes.Black, new XPoint(380, 180));
        gfx.DrawString("144", font, XBrushes.Black, new XPoint(490, 180));
        gfx.DrawString("0.500", font, XBrushes.Black, new XPoint(550, 180));
        document.Save(pdfPath);
        document.Close();
    }
}
