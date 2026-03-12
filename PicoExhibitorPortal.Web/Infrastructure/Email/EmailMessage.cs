namespace PicoExhibitorPortal.Web.Infrastructure.Email;

public sealed class EmailMessage
{
    public List<string> To { get; init; } = [];
    public List<string> Cc { get; init; } = [];
    public string Subject { get; init; } = string.Empty;
    public string Body { get; init; } = string.Empty;
    public List<EmailAttachment> Attachments { get; init; } = [];
}
