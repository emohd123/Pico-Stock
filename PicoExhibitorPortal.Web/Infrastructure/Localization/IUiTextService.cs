using System.Globalization;

namespace PicoExhibitorPortal.Web.Infrastructure.Localization;

public interface IUiTextService
{
    string Get(string key);
    string Localize(string english, string? arabic = null);
    bool IsArabic { get; }
    string Direction { get; }
    CultureInfo CurrentCulture { get; }
}
