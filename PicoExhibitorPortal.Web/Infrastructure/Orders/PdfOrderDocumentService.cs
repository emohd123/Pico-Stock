using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;
using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public sealed class PdfOrderDocumentService(IWebHostEnvironment environment) : IOrderDocumentService
{
    private const double LeftMargin = 40;
    private const double RightMargin = 40;
    private const double BottomMargin = 72;
    private const double RowHeight = 58;

    public Task<OrderDocumentResult> GenerateAsync(Order order, CancellationToken cancellationToken)
    {
        var outputFolder = Path.Combine(environment.ContentRootPath, "output", "pdf", "orders");
        Directory.CreateDirectory(outputFolder);

        var fileName = $"{order.PublicReference}.pdf";
        var physicalPath = Path.Combine(outputFolder, fileName);

        using var document = new PdfDocument();
        var titleFont = new XFont("Arial", 18, XFontStyle.Bold);
        var headingFont = new XFont("Arial", 11, XFontStyle.Bold);
        var bodyFont = new XFont("Arial", 10, XFontStyle.Regular);
        var smallFont = new XFont("Arial", 8, XFontStyle.Regular);

        var page = document.AddPage();
        page.Size = PdfSharpCore.PageSize.A4;
        using var pageScope = new PageScope(page);
        var gfx = pageScope.Graphics;

        double y = 40;
        gfx.DrawString("Pico International", titleFont, XBrushes.Teal, new XRect(LeftMargin, y, page.Width - LeftMargin - RightMargin, 24), XStringFormats.TopLeft);
        y += 28;
        gfx.DrawString("Exhibitor order summary", headingFont, XBrushes.Black, new XRect(LeftMargin, y, page.Width - LeftMargin - RightMargin, 16), XStringFormats.TopLeft);
        y += 28;

        foreach (var line in BuildHeaderLines(order))
        {
            gfx.DrawString(line, bodyFont, XBrushes.Black, new XRect(LeftMargin, y, page.Width - LeftMargin - RightMargin, 14), XStringFormats.TopLeft);
            y += 16;
        }

        y += 12;
        gfx.DrawString("Items", headingFont, XBrushes.Black, new XRect(LeftMargin, y, page.Width - LeftMargin - RightMargin, 16), XStringFormats.TopLeft);
        y += 18;
        DrawItemsHeader(gfx, headingFont, y);
        y += 18;

        foreach (var item in order.Lines)
        {
            if (y + RowHeight > page.Height - BottomMargin)
            {
                page = document.AddPage();
                page.Size = PdfSharpCore.PageSize.A4;
                pageScope.Reset(page);
                gfx = pageScope.Graphics;
                y = 40;
                DrawItemsHeader(gfx, headingFont, y);
                y += 18;
            }

            DrawOrderRow(gfx, item, bodyFont, smallFont, y);
            y += RowHeight;
        }

        y += 10;
        gfx.DrawLine(XPens.Black, LeftMargin, y, page.Width - RightMargin, y);
        y += 8;
        gfx.DrawString($"Grand Total: {order.GrandTotal:0.000} {order.Currency}", headingFont, XBrushes.Black, new XRect(360, y, 200, 16), XStringFormats.TopLeft);

        document.Save(physicalPath);

        return Task.FromResult(new OrderDocumentResult
        {
            PhysicalPath = physicalPath,
            FileName = fileName
        });
    }

    private void DrawOrderRow(XGraphics gfx, OrderLine item, XFont bodyFont, XFont smallFont, double y)
    {
        const double imageBoxX = LeftMargin;
        const double imageBoxSize = 42;
        const double codeX = 92;
        const double descriptionX = 150;
        const double qtyX = 380;
        const double unitX = 425;
        const double totalX = 490;

        gfx.DrawRoundedRectangle(XPens.Gainsboro, XBrushes.White, imageBoxX, y, imageBoxSize, imageBoxSize, 6, 6);

        var physicalImagePath = ResolvePhysicalImagePath(item.ItemImagePath);
        if (!string.IsNullOrWhiteSpace(physicalImagePath) && File.Exists(physicalImagePath))
        {
            using var image = XImage.FromFile(physicalImagePath);
            var imageRect = FitRect(image.PixelWidth, image.PixelHeight, imageBoxX + 3, y + 3, imageBoxSize - 6, imageBoxSize - 6);
            gfx.DrawImage(image, imageRect.X, imageRect.Y, imageRect.Width, imageRect.Height);
        }

        gfx.DrawString(item.ItemCode, smallFont, XBrushes.DimGray, new XRect(codeX, y, 55, 14), XStringFormats.TopLeft);
        gfx.DrawString(item.ItemNameEn, bodyFont, XBrushes.Black, new XRect(descriptionX, y, 220, 28), XStringFormats.TopLeft);
        gfx.DrawString($"Qty {item.Quantity}", bodyFont, XBrushes.Black, new XRect(qtyX, y, 40, 16), XStringFormats.TopLeft);
        gfx.DrawString($"{item.UnitPrice:0.000}", bodyFont, XBrushes.Black, new XRect(unitX, y, 55, 16), XStringFormats.TopLeft);
        gfx.DrawString($"{item.LineTotal:0.000}", bodyFont, XBrushes.Black, new XRect(totalX, y, 55, 16), XStringFormats.TopLeft);
        gfx.DrawLine(XPens.Gainsboro, LeftMargin, y + 48, 555, y + 48);
    }

    private static void DrawItemsHeader(XGraphics gfx, XFont headingFont, double y)
    {
        gfx.DrawString("Image", headingFont, XBrushes.Black, new XRect(LeftMargin, y, 45, 14), XStringFormats.TopLeft);
        gfx.DrawString("Code", headingFont, XBrushes.Black, new XRect(92, y, 55, 14), XStringFormats.TopLeft);
        gfx.DrawString("Description", headingFont, XBrushes.Black, new XRect(150, y, 220, 14), XStringFormats.TopLeft);
        gfx.DrawString("Qty", headingFont, XBrushes.Black, new XRect(380, y, 40, 14), XStringFormats.TopLeft);
        gfx.DrawString("Unit", headingFont, XBrushes.Black, new XRect(425, y, 55, 14), XStringFormats.TopLeft);
        gfx.DrawString("Total", headingFont, XBrushes.Black, new XRect(490, y, 55, 14), XStringFormats.TopLeft);
    }

    private string ResolvePhysicalImagePath(string imagePath)
    {
        if (string.IsNullOrWhiteSpace(imagePath))
        {
            return string.Empty;
        }

        // Web-relative paths always start with '/' and must be combined with WebRootPath.
        // Do NOT use Path.IsPathRooted here: on Linux, web paths like "/uploads/foo.png"
        // are considered rooted, so we would incorrectly skip the WebRootPath prefix and
        // the file would never be found (it lives at /app/wwwroot/uploads/foo.png).
        if (imagePath[0] == '/')
        {
            var trimmed = imagePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            return Path.Combine(environment.WebRootPath, trimmed);
        }

        // Already a platform-specific absolute path (e.g. Windows drive-letter path).
        if (Path.IsPathRooted(imagePath))
        {
            return imagePath;
        }

        var rel = imagePath.TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
        return Path.Combine(environment.WebRootPath, rel);
    }

    private static XRect FitRect(double sourceWidth, double sourceHeight, double targetX, double targetY, double targetWidth, double targetHeight)
    {
        if (sourceWidth <= 0 || sourceHeight <= 0)
        {
            return new XRect(targetX, targetY, targetWidth, targetHeight);
        }

        var ratio = Math.Min(targetWidth / sourceWidth, targetHeight / sourceHeight);
        var width = sourceWidth * ratio;
        var height = sourceHeight * ratio;
        var x = targetX + ((targetWidth - width) / 2);
        var y = targetY + ((targetHeight - height) / 2);
        return new XRect(x, y, width, height);
    }

    private static IEnumerable<string> BuildHeaderLines(Order order)
    {
        yield return $"Reference: {order.PublicReference}";
        yield return $"Submitted: {order.SubmittedAtUtc:yyyy-MM-dd HH:mm} UTC";
        yield return $"Exhibition: {order.ExhibitionName}";
        yield return $"Company: {order.ExhibitorCompany}";
        yield return $"Booth: {order.BoothNumber}";
        yield return $"Contact person: {order.ContactPerson}";
        yield return $"Email: {order.Email}";
        yield return $"Phone: {order.Phone}";
        if (!string.IsNullOrWhiteSpace(order.Notes))
        {
            yield return $"Notes: {order.Notes}";
        }
    }

    private sealed class PageScope(PdfPage page) : IDisposable
    {
        public XGraphics Graphics { get; private set; } = XGraphics.FromPdfPage(page);

        public void Reset(PdfPage page)
        {
            Graphics.Dispose();
            Graphics = XGraphics.FromPdfPage(page);
        }

        public void Dispose() => Graphics.Dispose();
    }
}
