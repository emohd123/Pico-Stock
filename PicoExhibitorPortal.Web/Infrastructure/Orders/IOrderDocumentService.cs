using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public interface IOrderDocumentService
{
    Task<OrderDocumentResult> GenerateAsync(Order order, CancellationToken cancellationToken);
}
