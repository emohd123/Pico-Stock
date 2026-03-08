namespace PicoExhibitorPortal.Web.Options;

public sealed class SupabaseOptions
{
    public const string SectionName = "Supabase";

    public string Url { get; set; } = string.Empty;
    public string PublishableKey { get; set; } = string.Empty;
    public string ServiceRoleKey { get; set; } = string.Empty;
    public string DbConnection { get; set; } = string.Empty;
}
