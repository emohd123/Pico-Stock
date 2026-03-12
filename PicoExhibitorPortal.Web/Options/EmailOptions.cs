namespace PicoExhibitorPortal.Web.Options;

public sealed class EmailOptions
{
    public const string SectionName = "Email";

    public string DeliveryProvider { get; set; } = "Resend";
    public string ResendApiKey { get; set; } = string.Empty;
    public string ResendApiBaseUrl { get; set; } = "https://api.resend.com";
    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; } = 25;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public bool UseSsl { get; set; }
    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = string.Empty;
    public string InternalRecipients { get; set; } = string.Empty;
    public string CcRecipients { get; set; } = string.Empty;
}
