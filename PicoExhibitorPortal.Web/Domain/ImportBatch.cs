namespace PicoExhibitorPortal.Web.Domain;

public sealed class ImportBatch
{
    public int Id { get; set; }
    public string SourceFileName { get; set; } = string.Empty;
    public string SourceFilePath { get; set; } = string.Empty;
    public DateTime ImportedAtUtc { get; set; }
    public string Status { get; set; } = ImportBatchStatuses.PendingReview;
    public string Summary { get; set; } = string.Empty;
    public string Warnings { get; set; } = string.Empty;
    public ICollection<ImportBatchItem> Items { get; set; } = new List<ImportBatchItem>();
}
