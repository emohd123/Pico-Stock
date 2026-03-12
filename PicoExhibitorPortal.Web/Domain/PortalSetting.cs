namespace PicoExhibitorPortal.Web.Domain;

public sealed class PortalSetting
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
