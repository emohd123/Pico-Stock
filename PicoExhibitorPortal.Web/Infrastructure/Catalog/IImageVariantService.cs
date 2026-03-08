namespace PicoExhibitorPortal.Web.Infrastructure.Catalog;

public interface IImageVariantService
{
    Task<ImageVariantSet> ProcessAsync(string sourceRelativePath, int batchId, CancellationToken cancellationToken);
}
