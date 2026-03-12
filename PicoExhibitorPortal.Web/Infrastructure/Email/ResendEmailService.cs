using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using PicoExhibitorPortal.Web.Options;

namespace PicoExhibitorPortal.Web.Infrastructure.Email;

public sealed class ResendEmailService(
    HttpClient httpClient,
    IOptions<EmailOptions> options,
    ILogger<ResendEmailService> logger) : IEmailService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var config = options.Value;
        if (!string.Equals(config.DeliveryProvider, "Resend", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogInformation("Email delivery provider is set to {Provider}. Resend send skipped for {Subject}.", config.DeliveryProvider, message.Subject);
            return;
        }

        if (string.IsNullOrWhiteSpace(config.ResendApiKey))
        {
            logger.LogWarning("Resend API key is not configured. Email skipped for {Subject}.", message.Subject);
            return;
        }

        if (string.IsNullOrWhiteSpace(config.FromEmail))
        {
            throw new InvalidOperationException("Email:FromEmail must be configured for Resend delivery.");
        }

        var attachments = new List<ResendAttachment>();
        foreach (var attachment in message.Attachments.Where(x => File.Exists(x.FilePath)))
        {
            var content = await File.ReadAllBytesAsync(attachment.FilePath, cancellationToken);
            attachments.Add(new ResendAttachment(
                string.IsNullOrWhiteSpace(attachment.FileName) ? Path.GetFileName(attachment.FilePath) : attachment.FileName,
                Convert.ToBase64String(content),
                attachment.MediaType));
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, BuildEmailsEndpoint(config.ResendApiBaseUrl));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.ResendApiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(new ResendSendEmailRequest(
            $"{config.FromName} <{config.FromEmail}>",
            message.To.Where(static x => !string.IsNullOrWhiteSpace(x)).ToArray(),
            message.Cc.Where(static x => !string.IsNullOrWhiteSpace(x)).ToArray(),
            message.Subject,
            message.Body,
            attachments), JsonOptions), Encoding.UTF8, "application/json");

        using var response = await httpClient.SendAsync(request, cancellationToken);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Resend email send failed with {(int)response.StatusCode}: {responseText}");
        }

        logger.LogInformation("Resend accepted email for {Subject}. Response: {Response}", message.Subject, responseText);
    }

    private static string BuildEmailsEndpoint(string? baseUrl)
    {
        var root = string.IsNullOrWhiteSpace(baseUrl) ? "https://api.resend.com" : baseUrl.TrimEnd('/');
        return $"{root}/emails";
    }

    private sealed record ResendSendEmailRequest(
        string From,
        string[] To,
        string[] Cc,
        string Subject,
        string Text,
        List<ResendAttachment> Attachments);

    private sealed record ResendAttachment(
        string Filename,
        string Content,
        [property: JsonPropertyName("content_type")] string ContentType);
}
