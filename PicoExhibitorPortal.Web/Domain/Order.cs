namespace PicoExhibitorPortal.Web.Domain;

public sealed class Order
{
    public int Id { get; set; }
    public string PublicReference { get; set; } = string.Empty;
    public string ExhibitionName { get; set; } = string.Empty;
    public string ExhibitorCompany { get; set; } = string.Empty;
    public string BoothNumber { get; set; } = string.Empty;
    public string ContactPerson { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = OrderStatuses.New;
    public DateTime SubmittedAtUtc { get; set; }
    public DateTime? StaffNotifiedAtUtc { get; set; }
    public DateTime? CustomerNotifiedAtUtc { get; set; }
    public string EmailDeliveryStatus { get; set; } = OrderEmailDeliveryStatuses.Pending;
    public string EmailDeliveryError { get; set; } = string.Empty;
    public string Currency { get; set; } = "BHD";
    public decimal GrandTotal { get; set; }
    public string PdfPath { get; set; } = string.Empty;
    public DateTime? PdfGeneratedAtUtc { get; set; }
    public ICollection<OrderLine> Lines { get; set; } = new List<OrderLine>();
}
