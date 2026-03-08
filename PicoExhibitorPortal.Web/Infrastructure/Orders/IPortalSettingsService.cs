namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public interface IPortalSettingsService
{
    Task<PortalSettingsView> GetAsync(CancellationToken cancellationToken);
    Task SaveAsync(PortalSettingsView settings, CancellationToken cancellationToken);
}
