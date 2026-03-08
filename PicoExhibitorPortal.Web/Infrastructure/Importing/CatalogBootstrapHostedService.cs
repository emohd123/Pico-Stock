using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Data;

namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public sealed class CatalogBootstrapHostedService(IServiceProvider serviceProvider, ILogger<CatalogBootstrapHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await using var scope = serviceProvider.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PortalDbContext>();
        var shouldRunImport = !await dbContext.ImportBatches.AnyAsync(stoppingToken)
            || await dbContext.CatalogItems.AnyAsync(
                x => string.IsNullOrWhiteSpace(x.CardImagePath)
                  || !EF.Functions.Like(x.CardImagePath, "%-hd2.%")
                  || !EF.Functions.Like(x.DetailImagePath, "%-hd2.%")
                  || !EF.Functions.Like(x.ThumbnailImagePath, "%-hd2.%")
                  || !x.IsActive
                  || !x.IsVerified
                  || (x.Price.HasValue && string.IsNullOrWhiteSpace(x.PriceSourceReference)),
                stoppingToken);

        shouldRunImport = shouldRunImport
            || await dbContext.CatalogItems.AnyAsync(
                x => x.Price.HasValue
                  && (AuthoritativeRateSheetOverrides.OverrideCodes.Contains(x.PicoCode)
                      || AuthoritativeRateSheetOverrides.OverrideSourceIds.Contains(x.SourceItemId))
                  && !EF.Functions.Like(x.PriceSourceReference, $"%{AuthoritativeRateSheetOverrides.SourceTag}%"),
                stoppingToken);

        if (!shouldRunImport)
        {
            return;
        }

        var importService = scope.ServiceProvider.GetRequiredService<ICatalogImportService>();
        var batch = await importService.RunConfiguredImportAsync(stoppingToken);
        if (batch is not null)
        {
            logger.LogInformation("Initial import batch {BatchId} created.", batch.Id);
        }
    }
}
