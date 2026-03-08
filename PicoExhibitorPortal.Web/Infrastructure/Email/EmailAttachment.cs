namespace PicoExhibitorPortal.Web.Infrastructure.Email;

public sealed class EmailAttachment
{
    public string FilePath { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
    public string MediaType { get; init; } = "application/octet-stream";
}
