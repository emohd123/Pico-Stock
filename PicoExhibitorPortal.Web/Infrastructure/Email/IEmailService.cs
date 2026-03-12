namespace PicoExhibitorPortal.Web.Infrastructure.Email;

public interface IEmailService
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}
