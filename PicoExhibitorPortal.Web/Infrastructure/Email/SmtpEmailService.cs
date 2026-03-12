using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using Microsoft.Extensions.Options;
using PicoExhibitorPortal.Web.Options;

namespace PicoExhibitorPortal.Web.Infrastructure.Email;

public sealed class SmtpEmailService(IOptions<EmailOptions> options, ILogger<SmtpEmailService> logger) : IEmailService
{
    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var config = options.Value;
        if (string.IsNullOrWhiteSpace(config.SmtpHost))
        {
            logger.LogInformation("SMTP host is not configured. Email skipped for {Subject}.", message.Subject);
            return;
        }

        var fromAddress = ResolveFromAddress(config);
        if (string.IsNullOrWhiteSpace(fromAddress))
        {
            logger.LogWarning("SMTP sender email is not configured. Email skipped for {Subject}.", message.Subject);
            return;
        }

        var toRecipients = message.To.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var ccRecipients = message.Cc.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (toRecipients.Count == 0 && ccRecipients.Count == 0)
        {
            logger.LogInformation("Email skipped for {Subject} because no recipients were supplied.", message.Subject);
            return;
        }

        using var mail = new MailMessage
        {
            From = new MailAddress(fromAddress, string.IsNullOrWhiteSpace(config.FromName) ? fromAddress : config.FromName),
            Subject = message.Subject,
            Body = message.Body
        };

        foreach (var recipient in toRecipients)
        {
            mail.To.Add(recipient);
        }

        foreach (var recipient in ccRecipients)
        {
            mail.CC.Add(recipient);
        }

        foreach (var attachment in message.Attachments.Where(x => File.Exists(x.FilePath)))
        {
            var mailAttachment = new Attachment(attachment.FilePath, attachment.MediaType)
            {
                Name = string.IsNullOrWhiteSpace(attachment.FileName)
                    ? Path.GetFileName(attachment.FilePath)
                    : attachment.FileName
            };
            mailAttachment.ContentDisposition!.Inline = false;
            mail.Attachments.Add(mailAttachment);
        }

        using var client = new SmtpClient(config.SmtpHost, config.SmtpPort)
        {
            EnableSsl = config.UseSsl
        };

        if (!string.IsNullOrWhiteSpace(config.Username))
        {
            client.Credentials = new NetworkCredential(config.Username, config.Password);
        }

        await client.SendMailAsync(mail, cancellationToken);
    }

    private static string ResolveFromAddress(EmailOptions config)
    {
        if (!string.IsNullOrWhiteSpace(config.FromEmail))
        {
            return config.FromEmail;
        }

        return !string.IsNullOrWhiteSpace(config.Username) && config.Username.Contains('@', StringComparison.Ordinal)
            ? config.Username
            : string.Empty;
    }
}
