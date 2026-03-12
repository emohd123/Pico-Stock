using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public interface ICatalogImportService
{
    Task<ImportBatch?> RunConfiguredImportAsync(CancellationToken cancellationToken);
    Task<ImportBatch?> RunUploadedImportAsync(Stream pptxStream, string pptxFileName, Stream? pdfStream, string? pdfFileName, CancellationToken cancellationToken);
    Task<IReadOnlyList<ImportBatch>> GetBatchesAsync(CancellationToken cancellationToken);
}
