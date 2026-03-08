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

        using var mail = new MailMessage
        {
            From = new MailAddress(config.FromEmail, config.FromName),
            Subject = message.Subject,
            Body = message.Body
        };

        foreach (var recipient in message.To.Where(x => !string.IsNullOrWhiteSpace(x)))
        {
            mail.To.Add(recipient);
        }

        foreach (var recipient in message.Cc.Where(x => !string.IsNullOrWhiteSpace(x)))
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
}
