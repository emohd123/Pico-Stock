using System.Globalization;
using Microsoft.AspNetCore.Http;
using PicoExhibitorPortal.Web.Infrastructure.Localization;

namespace PicoExhibitorPortal.Tests;

public sealed class UiTextServiceTests
{
    [Fact]
    public void ReturnsArabicTextWhenCurrentCultureIsArabic()
    {
        var previousCulture = CultureInfo.CurrentUICulture;
        var previous = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("ar");
            CultureInfo.CurrentUICulture = new CultureInfo("ar");

            var service = new UiTextService(new HttpContextAccessor { HttpContext = new DefaultHttpContext() });

            Assert.True(service.IsArabic);
            Assert.Equal("الكتالوج", service.Get("Catalog"));
            Assert.Equal("rtl", service.Direction);
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
            CultureInfo.CurrentUICulture = previousCulture;
        }
    }
}
