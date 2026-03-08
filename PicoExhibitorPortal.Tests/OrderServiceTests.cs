using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Domain;
using PicoExhibitorPortal.Web.Infrastructure.Email;
using PicoExhibitorPortal.Web.Infrastructure.Orders;
using PicoExhibitorPortal.Web.Infrastructure.Session;
using PicoExhibitorPortal.Web.Models.Cart;
using PicoExhibitorPortal.Web.Models.Checkout;

namespace PicoExhibitorPortal.Tests;

public sealed class OrderServiceTests
{
    [Fact]
    public async Task PlaceOrderPersistsSnapshotGeneratesPdfAndSendsAttachments()
    {
        await using var db = BuildDb();
        var email = new FakeEmailService();
        var cart = new FakeCartService(new CartViewModel
        {
            Currency = "BHD",
            Total = 25.000m,
            Lines =
            [
                new CartLineViewModel
                {
                    CatalogItemId = 1,
                    NameEn = "Blue Chair",
                    NameAr = "Blue Chair",
                    Code = "FVCHBLU1",
                    ImagePath = "/uploads/blue.jpg",
                    Quantity = 2,
                    UnitPrice = 12.500m,
                    LineTotal = 25.000m,
                    Currency = "BHD",
                    IsOrderable = true
                }
            ]
        });
        var documentService = new FakeOrderDocumentService();

        var service = new OrderService(db, cart, new FakeSettingsService(), documentService, email, NullLogger<OrderService>.Instance);

        var result = await service.PlaceOrderAsync(new OrderPlacementRequest
        {
            Checkout = new CheckoutViewModel
            {
                ExhibitionName = "Jewellery Arabia",
                ExhibitorCompany = "Acme Exhibits",
                BoothNumber = "A12",
                ContactPerson = "Sara",
                Email = "sara@example.com",
                Phone = "+973 12345678",
                Notes = "Need delivery before opening"
            }
        }, CancellationToken.None);

        var order = await db.Orders.Include(x => x.Lines).SingleAsync();
        Assert.Equal(result.PublicReference, order.PublicReference);
        Assert.Equal("FVCHBLU1", order.Lines.Single().ItemCode);
        Assert.Equal("C:\\temp\\order.pdf", order.PdfPath);
        Assert.NotNull(order.PdfGeneratedAtUtc);
        Assert.Equal(2, email.Messages.Count);
        Assert.All(email.Messages, message => Assert.Single(message.Attachments));
        Assert.Equal(1, cart.ClearCalls);
        Assert.NotNull(order.StaffNotifiedAtUtc);
    }

    [Fact]
    public async Task PlaceOrderStillSucceedsWhenEmailDeliveryFails()
    {
        await using var db = BuildDb();
        var email = new ThrowingEmailService();
        var cart = new FakeCartService(new CartViewModel
        {
            Currency = "BHD",
            Total = 25.000m,
            Lines =
            [
                new CartLineViewModel
                {
                    CatalogItemId = 1,
                    NameEn = "Blue Chair",
                    NameAr = "Blue Chair",
                    Code = "FVCHBLU1",
                    ImagePath = "/uploads/blue.jpg",
                    Quantity = 2,
                    UnitPrice = 12.500m,
                    LineTotal = 25.000m,
                    Currency = "BHD",
                    IsOrderable = true
                }
            ]
        });
        var documentService = new FakeOrderDocumentService();

        var service = new OrderService(db, cart, new FakeSettingsService(), documentService, email, NullLogger<OrderService>.Instance);

        var result = await service.PlaceOrderAsync(new OrderPlacementRequest
        {
            Checkout = new CheckoutViewModel
            {
                ExhibitionName = "Jewellery Arabia",
                ExhibitorCompany = "Acme Exhibits",
                BoothNumber = "A12",
                ContactPerson = "Sara",
                Email = "sara@example.com",
                Phone = "+973 12345678",
                Notes = "Need delivery before opening"
            }
        }, CancellationToken.None);

        var order = await db.Orders.Include(x => x.Lines).SingleAsync();
        Assert.Equal(result.PublicReference, order.PublicReference);
        Assert.Equal("C:\\temp\\order.pdf", order.PdfPath);
        Assert.Equal(PicoExhibitorPortal.Web.Domain.OrderEmailDeliveryStatuses.PendingRetry, order.EmailDeliveryStatus);
        Assert.Contains("Staff email failed", order.EmailDeliveryError);
        Assert.Contains("Customer email failed", order.EmailDeliveryError);
        Assert.Equal(1, cart.ClearCalls);
    }

    [Fact]
    public async Task UpdateOrderRecalculatesTotalsAndRegeneratesPdf()
    {
        await using var db = BuildDb();
        db.CatalogItems.Add(new CatalogItem
        {
            Id = 7,
            NameEn = "Executive Chair",
            NameAr = "Executive Chair",
            PicoCode = "FEXECHRB",
            PrimaryImagePath = "/uploads/executive.png",
            ThumbnailImagePath = "/uploads/executive-thumb.png",
            IsActive = true,
            IsVerified = true,
            Price = 21.000m,
            Currency = "BHD",
            Slug = "executive-chair"
        });
        db.Orders.Add(new Order
        {
            PublicReference = "PIC-TEST-001",
            ExhibitionName = "Expo",
            ExhibitorCompany = "Client",
            BoothNumber = "B12",
            ContactPerson = "Mona",
            Email = "mona@example.com",
            Phone = "123",
            Currency = "BHD",
            GrandTotal = 1.000m,
            Lines =
            [
                new OrderLine
                {
                    CatalogItemId = 7,
                    ItemNameEn = "Old Chair",
                    ItemNameAr = "Old Chair",
                    ItemCode = "OLD",
                    ItemImagePath = "/uploads/old.png",
                    Quantity = 1,
                    UnitPrice = 1.000m,
                    LineTotal = 1.000m
                }
            ]
        });
        await db.SaveChangesAsync();

        var service = new OrderService(db, new FakeCartService(new CartViewModel()), new FakeSettingsService(), new FakeOrderDocumentService(), new FakeEmailService(), NullLogger<OrderService>.Instance);

        var updated = await service.UpdateOrderAsync(new AdminOrderUpdateRequest
        {
            OrderId = db.Orders.Single().Id,
            ExhibitionName = "Updated Expo",
            ExhibitorCompany = "Updated Client",
            BoothNumber = "C44",
            ContactPerson = "Huda",
            Email = "huda@example.com",
            Phone = "999",
            Notes = "Updated note",
            Status = OrderStatuses.Confirmed,
            Currency = "BHD",
            Lines =
            [
                new AdminOrderUpdateLineRequest
                {
                    CatalogItemId = 7,
                    Quantity = 3,
                    UnitPrice = 21.000m
                }
            ]
        }, CancellationToken.None);

        Assert.True(updated);

        var order = await db.Orders.Include(x => x.Lines).SingleAsync();
        Assert.Equal("Updated Expo", order.ExhibitionName);
        Assert.Equal(OrderStatuses.Confirmed, order.Status);
        Assert.Equal(63.000m, order.GrandTotal);
        Assert.Equal("FEXECHRB", order.Lines.Single().ItemCode);
        Assert.Equal("C:\\temp\\order.pdf", order.PdfPath);
        Assert.NotNull(order.PdfGeneratedAtUtc);
    }

    [Fact]
    public async Task DeleteOrderRemovesOrderAndPdfFile()
    {
        await using var db = BuildDb();
        var tempFolder = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempFolder);
        var pdfPath = Path.Combine(tempFolder, "order.pdf");
        await File.WriteAllTextAsync(pdfPath, "pdf");

        db.Orders.Add(new Order
        {
            PublicReference = "PIC-TEST-DELETE",
            ExhibitionName = "Expo",
            ExhibitorCompany = "Client",
            BoothNumber = "B12",
            ContactPerson = "Mona",
            Email = "mona@example.com",
            Phone = "123",
            Currency = "BHD",
            GrandTotal = 1.000m,
            PdfPath = pdfPath,
            Lines =
            [
                new OrderLine
                {
                    ItemNameEn = "Chair",
                    ItemNameAr = "Chair",
                    ItemCode = "CHAIR",
                    ItemImagePath = "/uploads/chair.png",
                    Quantity = 1,
                    UnitPrice = 1.000m,
                    LineTotal = 1.000m
                }
            ]
        });
        await db.SaveChangesAsync();

        var service = new OrderService(db, new FakeCartService(new CartViewModel()), new FakeSettingsService(), new FakeOrderDocumentService(), new FakeEmailService(), NullLogger<OrderService>.Instance);

        var deleted = await service.DeleteOrderAsync(db.Orders.Single().Id, CancellationToken.None);

        Assert.True(deleted);
        Assert.Empty(db.Orders);
        Assert.False(File.Exists(pdfPath));
    }

    private static PortalDbContext BuildDb()
    {
        var options = new DbContextOptionsBuilder<PortalDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new PortalDbContext(options);
    }

    private sealed class FakeEmailService : IEmailService
    {
        public List<EmailMessage> Messages { get; } = [];
        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
        {
            Messages.Add(message);
            return Task.CompletedTask;
        }
    }

    private sealed class FakeOrderDocumentService : IOrderDocumentService
    {
        public Task<OrderDocumentResult> GenerateAsync(PicoExhibitorPortal.Web.Domain.Order order, CancellationToken cancellationToken)
        {
            return Task.FromResult(new OrderDocumentResult
            {
                FileName = "order.pdf",
                PhysicalPath = "C:\\temp\\order.pdf"
            });
        }
    }

    private sealed class ThrowingEmailService : IEmailService
    {
        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Resend 403 domain not verified");
    }

    private sealed class FakeCartService(CartViewModel cart) : ICartService
    {
        public int ClearCalls { get; private set; }
        public Task AddAsync(int catalogItemId, int quantity, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task UpdateAsync(int catalogItemId, int quantity, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task RemoveAsync(int catalogItemId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task ClearAsync(CancellationToken cancellationToken)
        {
            ClearCalls++;
            return Task.CompletedTask;
        }

        public Task<CartViewModel> GetCartAsync(CancellationToken cancellationToken) => Task.FromResult(cart);
    }

    private sealed class FakeSettingsService : IPortalSettingsService
    {
        public Task<PortalSettingsView> GetAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new PortalSettingsView { InternalRecipients = "ebrahim@picobahrain.com" });

        public Task SaveAsync(PortalSettingsView settings, CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
