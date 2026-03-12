using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Domain;
using PicoExhibitorPortal.Web.Options;

namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public sealed class PortalSettingsService(
    PortalDbContext dbContext,
    IOptions<EmailOptions> emailOptions,
    IOptions<SeedSourceOptions> sourceOptions) : IPortalSettingsService
{
    private static class Keys
    {
        public const string InternalRecipients = "Portal.InternalRecipients";
        public const string CcRecipients = "Portal.CcRecipients";
        public const string PptxPath = "Portal.PptxPath";
        public const string PdfPath = "Portal.PdfPath";
        public const string Currency = "Portal.Currency";
    }

    public async Task<PortalSettingsView> GetAsync(CancellationToken cancellationToken)
    {
        var stored = await dbContext.PortalSettings.AsNoTracking().ToDictionaryAsync(x => x.Key, x => x.Value, cancellationToken);
        return new PortalSettingsView
        {
            InternalRecipients = GetValue(stored, Keys.InternalRecipients, emailOptions.Value.InternalRecipients),
            CcRecipients = GetValue(stored, Keys.CcRecipients, emailOptions.Value.CcRecipients),
            PptxSourcePath = GetFilePathValue(stored, Keys.PptxPath, sourceOptions.Value.PptxPath),
            PdfSourcePath = GetFilePathValue(stored, Keys.PdfPath, sourceOptions.Value.PdfPath),
            Currency = GetValue(stored, Keys.Currency, sourceOptions.Value.DefaultCurrency)
        };
    }

    public async Task SaveAsync(PortalSettingsView settings, CancellationToken cancellationToken)
    {
        await UpsertAsync(Keys.InternalRecipients, settings.InternalRecipients, cancellationToken);
        await UpsertAsync(Keys.CcRecipients, settings.CcRecipients, cancellationToken);
        await UpsertAsync(Keys.PptxPath, settings.PptxSourcePath, cancellationToken);
        await UpsertAsync(Keys.PdfPath, settings.PdfSourcePath, cancellationToken);
        await UpsertAsync(Keys.Currency, settings.Currency, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task UpsertAsync(string key, string value, CancellationToken cancellationToken)
    {
        var entity = await dbContext.PortalSettings.FirstOrDefaultAsync(x => x.Key == key, cancellationToken);
        if (entity is null)
        {
            dbContext.PortalSettings.Add(new PortalSetting { Key = key, Value = value });
            return;
        }

        entity.Value = value;
    }

    private static string GetValue(IReadOnlyDictionary<string, string> source, string key, string fallback) =>
        source.TryGetValue(key, out var value) ? value : fallback;

    // For file-path settings: only use the DB value if the file still exists on disk.
    // Falls back to the seed/env-var path when the container's ephemeral filesystem has been wiped.
    private static string GetFilePathValue(IReadOnlyDictionary<string, string> source, string key, string fallback) =>
        source.TryGetValue(key, out var value) && File.Exists(value) ? value : fallback;
}
