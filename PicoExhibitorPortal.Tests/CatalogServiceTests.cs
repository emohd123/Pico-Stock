using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Domain;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;

namespace PicoExhibitorPortal.Tests;

public sealed class CatalogServiceTests
{
    [Fact]
    public async Task CreateCatalogItemAssignsSlugDefaultsAndPersists()
    {
        await using var db = BuildDb();
        var service = new CatalogService(db);

        var created = await service.CreateCatalogItemAsync(new CatalogItem
        {
            NameEn = "New Accent Chair",
            CategoryEn = "Armchairs",
            PrimaryImagePath = "/uploads/new-chair.png",
            PicoCode = "NEWACCENT1",
            Currency = "bhd",
            IsActive = true,
            IsVerified = true
        }, CancellationToken.None);

        var saved = await db.CatalogItems.SingleAsync();
        Assert.Equal(created.Id, saved.Id);
        Assert.Equal("new-accent-chair-newaccent1", saved.Slug);
        Assert.Equal("/uploads/new-chair.png", saved.CardImagePath);
        Assert.Equal("/uploads/new-chair.png", saved.DetailImagePath);
        Assert.Equal("/uploads/new-chair.png", saved.ThumbnailImagePath);
        Assert.Equal("BHD", saved.Currency);
        Assert.True(saved.LastVerifiedAtUtc.HasValue);
    }

    private static PortalDbContext BuildDb()
    {
        var options = new DbContextOptionsBuilder<PortalDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
            .Options;
        return new PortalDbContext(options);
    }
}
