namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public sealed class AdminOrderUpdateRequest
{
    public int OrderId { get; set; }
    public string ExhibitionName { get; set; } = string.Empty;
    public string ExhibitorCompany { get; set; } = string.Empty;
    public string BoothNumber { get; set; } = string.Empty;
    public string ContactPerson { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Currency { get; set; } = "BHD";
    public List<AdminOrderUpdateLineRequest> Lines { get; set; } = [];
}
