using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Domain;
using PicoExhibitorPortal.Web.Infrastructure.Email;
using PicoExhibitorPortal.Web.Infrastructure.Session;

namespace PicoExhibitorPortal.Web.Infrastructure.Orders;

public sealed class OrderService(
    PortalDbContext dbContext,
    ICartService cartService,
    IPortalSettingsService settingsService,
    IOrderDocumentService orderDocumentService,
    IEmailService emailService,
    ILogger<OrderService> logger) : IOrderService
{
    public async Task<OrderPlacementResult> PlaceOrderAsync(OrderPlacementRequest request, CancellationToken cancellationToken)
    {
        var cart = await cartService.GetCartAsync(cancellationToken);
        if (cart.Lines.Count == 0)
        {
            throw new InvalidOperationException("Cart is empty.");
        }

        if (cart.Lines.Any(x => !x.IsOrderable))
        {
            throw new InvalidOperationException("Cart contains unverified items.");
        }

        var order = new Order
        {
            PublicReference = BuildReference(),
            ExhibitionName = request.Checkout.ExhibitionName.Trim(),
            ExhibitorCompany = request.Checkout.ExhibitorCompany.Trim(),
            BoothNumber = request.Checkout.BoothNumber.Trim(),
            ContactPerson = request.Checkout.ContactPerson.Trim(),
            Email = request.Checkout.Email.Trim(),
            Phone = request.Checkout.Phone.Trim(),
            Notes = request.Checkout.Notes?.Trim() ?? string.Empty,
            SubmittedAtUtc = DateTime.UtcNow,
            Currency = cart.Currency,
            GrandTotal = cart.Total,
            Lines = cart.Lines.Select(x => new OrderLine
            {
                CatalogItemId = x.CatalogItemId,
                ItemNameEn = x.NameEn,
                ItemNameAr = x.NameAr,
                ItemCode = x.Code,
                ItemImagePath = x.ImagePath,
                UnitPrice = x.UnitPrice,
                Quantity = x.Quantity,
                LineTotal = x.LineTotal
            }).ToList()
        };

        dbContext.Orders.Add(order);
        await dbContext.SaveChangesAsync(cancellationToken);

        var document = await RegeneratePdfAsync(order, cancellationToken);

        var settings = await settingsService.GetAsync(cancellationToken);
        var internalRecipients = settings.InternalRecipients.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList();
        var ccRecipients = settings.CcRecipients.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList();
        var body = BuildEmailBody(order, document.FileName);
        var emailAttachment = new EmailAttachment
        {
            FilePath = document.PhysicalPath,
            FileName = document.FileName,
            MediaType = "application/pdf"
        };
        var deliveryErrors = new List<string>();

        try
        {
            await emailService.SendAsync(new EmailMessage
            {
                To = internalRecipients,
                Cc = ccRecipients,
                Subject = $"Pico order request {order.PublicReference}",
                Body = body,
                Attachments = [emailAttachment]
            }, cancellationToken);

            order.StaffNotifiedAtUtc = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            deliveryErrors.Add($"Staff email failed: {ex.Message}");
            logger.LogError(ex, "Failed to send staff order email for {PublicReference}.", order.PublicReference);
        }

        try
        {
            await emailService.SendAsync(new EmailMessage
            {
                To = [order.Email],
                Subject = $"Pico order confirmation {order.PublicReference}",
                Body = body,
                Attachments = [emailAttachment]
            }, cancellationToken);

            order.CustomerNotifiedAtUtc = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            deliveryErrors.Add($"Customer email failed: {ex.Message}");
            logger.LogError(ex, "Failed to send customer order email for {PublicReference}.", order.PublicReference);
        }

        order.EmailDeliveryStatus = deliveryErrors.Count == 0
            ? OrderEmailDeliveryStatuses.Sent
            : OrderEmailDeliveryStatuses.PendingRetry;
        order.EmailDeliveryError = string.Join(Environment.NewLine, deliveryErrors);
        await dbContext.SaveChangesAsync(cancellationToken);
        await cartService.ClearAsync(cancellationToken);

        logger.LogInformation("Order {PublicReference} placed.", order.PublicReference);

        return new OrderPlacementResult
        {
            OrderId = order.Id,
            PublicReference = order.PublicReference,
            EmailDeliveryStatus = order.EmailDeliveryStatus,
            EmailDeliveryError = order.EmailDeliveryError
        };
    }

    public Task<Order?> GetByPublicReferenceAsync(string publicReference, CancellationToken cancellationToken) =>
        dbContext.Orders.AsNoTracking().Include(x => x.Lines).FirstOrDefaultAsync(x => x.PublicReference == publicReference, cancellationToken);

    public Task<Order?> GetByIdAsync(int id, CancellationToken cancellationToken) =>
        dbContext.Orders.AsNoTracking().Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public async Task<IReadOnlyList<Order>> GetOrdersAsync(CancellationToken cancellationToken) =>
        await dbContext.Orders.AsNoTracking().Include(x => x.Lines).OrderByDescending(x => x.SubmittedAtUtc).ToListAsync(cancellationToken);

    public async Task<bool> UpdateOrderAsync(AdminOrderUpdateRequest request, CancellationToken cancellationToken)
    {
        var order = await dbContext.Orders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == request.OrderId, cancellationToken);
        if (order is null)
        {
            return false;
        }

        order.ExhibitionName = request.ExhibitionName.Trim();
        order.ExhibitorCompany = request.ExhibitorCompany.Trim();
        order.BoothNumber = request.BoothNumber.Trim();
        order.ContactPerson = request.ContactPerson.Trim();
        order.Email = request.Email.Trim();
        order.Phone = request.Phone.Trim();
        order.Notes = request.Notes.Trim();
        order.Status = request.Status.Trim();
        order.Currency = string.IsNullOrWhiteSpace(request.Currency) ? order.Currency : request.Currency.Trim().ToUpperInvariant();

        var catalogIds = request.Lines.Select(x => x.CatalogItemId).Distinct().ToList();
        var catalogItems = await dbContext.CatalogItems
            .Where(x => catalogIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        var incomingLineIds = request.Lines.Where(x => x.LineId.HasValue).Select(x => x.LineId!.Value).ToHashSet();
        var removedLines = order.Lines.Where(x => !incomingLineIds.Contains(x.Id)).ToList();
        if (removedLines.Count > 0)
        {
            dbContext.OrderLines.RemoveRange(removedLines);
            foreach (var removedLine in removedLines)
            {
                order.Lines.Remove(removedLine);
            }
        }

        foreach (var lineRequest in request.Lines)
        {
            if (!catalogItems.TryGetValue(lineRequest.CatalogItemId, out var catalogItem))
            {
                continue;
            }

            var line = lineRequest.LineId.HasValue
                ? order.Lines.FirstOrDefault(x => x.Id == lineRequest.LineId.Value)
                : null;

            if (line is null)
            {
                line = new OrderLine();
                order.Lines.Add(line);
            }

            line.CatalogItemId = catalogItem.Id;
            line.ItemNameEn = catalogItem.NameEn;
            line.ItemNameAr = catalogItem.NameAr;
            line.ItemCode = catalogItem.PicoCode;
            line.ItemImagePath = !string.IsNullOrWhiteSpace(catalogItem.ThumbnailImagePath)
                ? catalogItem.ThumbnailImagePath
                : !string.IsNullOrWhiteSpace(catalogItem.PrimaryImagePath)
                    ? catalogItem.PrimaryImagePath
                    : string.Empty;
            line.Quantity = lineRequest.Quantity;
            line.UnitPrice = decimal.Round(lineRequest.UnitPrice, 3, MidpointRounding.AwayFromZero);
            line.LineTotal = decimal.Round(line.Quantity * line.UnitPrice, 3, MidpointRounding.AwayFromZero);
        }

        order.GrandTotal = decimal.Round(order.Lines.Sum(x => x.LineTotal), 3, MidpointRounding.AwayFromZero);
        await dbContext.SaveChangesAsync(cancellationToken);
        await RegeneratePdfAsync(order, cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteOrderAsync(int id, CancellationToken cancellationToken)
    {
        var order = await dbContext.Orders.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (order is null)
        {
            return false;
        }

        var pdfPath = order.PdfPath;
        dbContext.OrderLines.RemoveRange(order.Lines);
        dbContext.Orders.Remove(order);
        await dbContext.SaveChangesAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(pdfPath) && File.Exists(pdfPath))
        {
            File.Delete(pdfPath);
        }

        return true;
    }

    private static string BuildReference() => $"PIC-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid():N}"[..21].ToUpperInvariant();

    private async Task<OrderDocumentResult> RegeneratePdfAsync(Order order, CancellationToken cancellationToken)
    {
        var document = await orderDocumentService.GenerateAsync(order, cancellationToken);
        order.PdfPath = document.PhysicalPath;
        order.PdfGeneratedAtUtc = DateTime.UtcNow;
        return document;
    }

    private static string BuildEmailBody(Order order, string pdfFileName)
    {
        var bodyLines = new List<string>
        {
            "Pico International order request",
            "Attached PDF: " + pdfFileName,
            string.Empty,
            $"Reference: {order.PublicReference}",
            $"Exhibition: {order.ExhibitionName}",
            $"Company: {order.ExhibitorCompany}",
            $"Booth: {order.BoothNumber}",
            $"Contact: {order.ContactPerson}",
            $"Email: {order.Email}",
            $"Phone: {order.Phone}",
            $"Notes: {order.Notes}",
            string.Empty,
            "Items:"
        };

        bodyLines.AddRange(order.Lines.Select(x => $"- {x.ItemNameEn} / {x.ItemNameAr} x {x.Quantity} @ {x.UnitPrice:0.000} {order.Currency}"));
        bodyLines.Add(string.Empty);
        bodyLines.Add($"Total: {order.GrandTotal:0.000} {order.Currency}");
        return string.Join(Environment.NewLine, bodyLines);
    }
}
