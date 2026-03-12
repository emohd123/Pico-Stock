using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Data;

namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public sealed class CatalogBootstrapHostedService(
    IServiceProvider serviceProvider,
    IWebHostEnvironment environment,
    ILogger<CatalogBootstrapHostedService> logger) : BackgroundService
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

        // Detect ephemeral filesystem reset: image paths exist in DB but files are gone on disk.
        // This happens on Railway/Docker when the container restarts without a persistent volume.
        if (!shouldRunImport)
        {
            var sampleImagePath = await dbContext.CatalogItems
                .Where(x => !string.IsNullOrWhiteSpace(x.CardImagePath))
                .Select(x => x.CardImagePath)
                .FirstOrDefaultAsync(stoppingToken);

            if (sampleImagePath is not null)
            {
                var physicalPath = Path.Combine(
                    environment.WebRootPath,
                    sampleImagePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));

                if (!File.Exists(physicalPath))
                {
                    logger.LogInformation(
                        "Image files missing from filesystem (ephemeral storage reset detected). Re-running import to restore images.");
                    shouldRunImport = true;
                }
            }
        }

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
