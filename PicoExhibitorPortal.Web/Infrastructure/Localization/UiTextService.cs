using System.Globalization;
using Microsoft.AspNetCore.Localization;

namespace PicoExhibitorPortal.Web.Infrastructure.Localization;

public sealed class UiTextService(IHttpContextAccessor accessor) : IUiTextService
{
    private static readonly IReadOnlyDictionary<string, (string En, string Ar)> Text = new Dictionary<string, (string, string)>(StringComparer.OrdinalIgnoreCase)
    {
        ["PortalName"] = ("Pico International", "بيكو انترناشيونال"),
        ["PortalTagline"] = ("Exhibitor extras ordering portal", "بوابة طلب مستلزمات العارضين"),
        ["Home"] = ("Home", "الرئيسية"),
        ["BrowseCatalog"] = ("Browse catalog", "تصفح الكتالوج"),
        ["Admin"] = ("Admin", "الإدارة"),
        ["Cart"] = ("Cart", "السلة"),
        ["Checkout"] = ("Checkout", "إتمام الطلب"),
        ["HomeHeadline"] = ("Order booth extras online for any Pico exhibition.", "اطلب تجهيزات الجناح عبر الإنترنت لأي معرض من معارض بيكو."),
        ["HomeBlurb"] = ("Browse furniture, screens, lighting, accessories, and submit your booth request for staff review and invoicing.", "تصفح الأثاث والشاشات والإضاءة والإكسسوارات ثم أرسل طلب جناحك لمراجعته وإصدار الفاتورة."),
        ["VerifiedCatalog"] = ("Verified items only", "العناصر المعتمدة فقط"),
        ["NoItems"] = ("No verified items are published yet. Review imported items in the admin area.", "لا توجد عناصر معتمدة منشورة بعد. راجع العناصر المستوردة في لوحة الإدارة."),
        ["Catalog"] = ("Catalog", "الكتالوج"),
        ["AddToCart"] = ("Add to cart", "أضف إلى السلة"),
        ["RequestPrice"] = ("Price pending verification", "السعر بانتظار التحقق"),
        ["ItemCode"] = ("Item code", "رمز العنصر"),
        ["Category"] = ("Category", "الفئة"),
        ["Specs"] = ("Specifications", "المواصفات"),
        ["Quantity"] = ("Quantity", "الكمية"),
        ["ContinueShopping"] = ("Continue shopping", "متابعة التصفح"),
        ["OrderSummary"] = ("Order summary", "ملخص الطلب"),
        ["SubmitOrder"] = ("Submit order", "إرسال الطلب"),
        ["ExhibitionName"] = ("Exhibition name", "اسم المعرض"),
        ["CompanyName"] = ("Exhibitor company", "شركة العارض"),
        ["BoothNumber"] = ("Booth number", "رقم الجناح"),
        ["ContactPerson"] = ("Contact person", "الشخص المسؤول"),
        ["Email"] = ("Email", "البريد الإلكتروني"),
        ["Phone"] = ("Phone", "الهاتف"),
        ["Notes"] = ("Notes", "ملاحظات"),
        ["OrderPlaced"] = ("Order submitted", "تم إرسال الطلب"),
        ["Reference"] = ("Reference", "المرجع"),
        ["Settings"] = ("Settings", "الإعدادات"),
        ["Imports"] = ("Imports", "الاستيراد"),
        ["Orders"] = ("Orders", "الطلبات"),
        ["CatalogAdmin"] = ("Catalog management", "إدارة الكتالوج"),
        ["Verify"] = ("Verify", "اعتماد"),
        ["Save"] = ("Save", "حفظ"),
        ["RunImport"] = ("Run configured import", "تشغيل الاستيراد المحدد"),
        ["InternalRecipients"] = ("Internal recipients", "المستلمون الداخليون"),
        ["PptxSource"] = ("PPTX source path", "مسار ملف PPTX"),
        ["PdfSource"] = ("PDF source path", "مسار ملف PDF"),
        ["Currency"] = ("Currency", "العملة"),
        ["Status"] = ("Status", "الحالة"),
        ["Language"] = ("Language", "اللغة"),
        ["English"] = ("English", "الإنجليزية"),
        ["Arabic"] = ("Arabic", "العربية")
    };

    public CultureInfo CurrentCulture =>
        accessor.HttpContext?.Features.Get<IRequestCultureFeature>()?.RequestCulture.Culture
        ?? CultureInfo.CurrentUICulture;

    public bool IsArabic => string.Equals(CurrentCulture.TwoLetterISOLanguageName, "ar", StringComparison.OrdinalIgnoreCase);

    public string Direction => IsArabic ? "rtl" : "ltr";

    public string Get(string key)
    {
        if (!Text.TryGetValue(key, out var entry))
        {
            return key;
        }

        return IsArabic ? entry.Ar : entry.En;
    }

    public string Localize(string english, string? arabic = null) => IsArabic ? arabic ?? english : english;
}
