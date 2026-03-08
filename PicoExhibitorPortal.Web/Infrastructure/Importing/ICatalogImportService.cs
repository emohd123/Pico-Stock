using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public interface ICatalogImportService
{
    Task<ImportBatch?> RunConfiguredImportAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<ImportBatch>> GetBatchesAsync(CancellationToken cancellationToken);
}
