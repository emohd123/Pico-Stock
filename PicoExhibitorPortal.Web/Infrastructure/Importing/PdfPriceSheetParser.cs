using System.Text.RegularExpressions;
using UglyToad.PdfPig;

namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public sealed class PdfPriceSheetParser : IPriceSheetParser
{
    public IReadOnlyList<PriceSheetEntry> Parse(string pdfPath)
    {
        var results = new List<PriceSheetEntry>(AuthoritativeRateSheetOverrides.Entries);
        if (string.IsNullOrWhiteSpace(pdfPath) || !File.Exists(pdfPath))
        {
            return results;
        }

        using var document = PdfDocument.Open(pdfPath);
        foreach (var page in document.GetPages())
        {
            var words = page.GetWords().ToList();
            if (!words.Any() || !page.Text.Contains("RATES", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var rows = words
                .GroupBy(word => Math.Round((double)word.BoundingBox.Bottom, 0))
                .OrderBy(group => group.Key);

            foreach (var row in rows)
            {
                var tokens = row.OrderBy(word => word.BoundingBox.Left).Select(word => word.Text).ToList();
                var numbers = tokens.Where(token => Regex.IsMatch(token, @"^\d+(?:\.\d+)?$")).ToList();
                if (numbers.Count < 2)
                {
                    continue;
                }

                var sourceItemId = tokens.FirstOrDefault(token => Regex.IsMatch(token, @"^\d{3,4}$"));
                var picoCode = tokens.FirstOrDefault(token => Regex.IsMatch(token, @"^[A-Z][A-Z0-9]+$") && !token.StartsWith("H", StringComparison.OrdinalIgnoreCase));
                if (string.IsNullOrWhiteSpace(sourceItemId) || string.IsNullOrWhiteSpace(picoCode))
                {
                    continue;
                }

                if (!decimal.TryParse(numbers[^1], out var rate))
                {
                    continue;
                }

                results.Add(new PriceSheetEntry
                {
                    SourceItemId = sourceItemId,
                    PicoCode = picoCode,
                    UnitRate = rate,
                    SourceReference = $"{Path.GetFileName(pdfPath)}:page-{page.Number}:row-{row.Key:0}"
                });
            }
        }

        return results;
    }
}
