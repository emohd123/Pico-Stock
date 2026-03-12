using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Domain;

namespace PicoExhibitorPortal.Web.Data;

public sealed class PortalDbContext(DbContextOptions<PortalDbContext> options) : DbContext(options)
{
    public DbSet<CatalogItem> CatalogItems => Set<CatalogItem>();
    public DbSet<CatalogItemImage> CatalogItemImages => Set<CatalogItemImage>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<ImportBatchItem> ImportBatchItems => Set<ImportBatchItem>();
    public DbSet<PortalSetting> PortalSettings => Set<PortalSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CatalogItem>(entity =>
        {
            entity.Property(x => x.NameEn).HasMaxLength(256);
            entity.Property(x => x.NameAr).HasMaxLength(256);
            entity.Property(x => x.CategoryEn).HasMaxLength(128);
            entity.Property(x => x.CategoryAr).HasMaxLength(128);
            entity.Property(x => x.PicoCode).HasMaxLength(64);
            entity.Property(x => x.SourceItemId).HasMaxLength(64);
            entity.Property(x => x.Slug).HasMaxLength(256);
            entity.Property(x => x.OriginalImagePath).HasMaxLength(512);
            entity.Property(x => x.PrimaryImagePath).HasMaxLength(512);
            entity.Property(x => x.CardImagePath).HasMaxLength(512);
            entity.Property(x => x.DetailImagePath).HasMaxLength(512);
            entity.Property(x => x.ThumbnailImagePath).HasMaxLength(512);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.PriceSourceReference).HasMaxLength(512);
            entity.Property(x => x.Price).HasColumnType("decimal(18,3)");
            entity.HasIndex(x => x.Slug).IsUnique();
            entity.HasIndex(x => x.PicoCode);
        });

        modelBuilder.Entity<CatalogItemImage>(entity =>
        {
            entity.Property(x => x.ImagePath).HasMaxLength(512);
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.Property(x => x.PublicReference).HasMaxLength(32);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.PdfPath).HasMaxLength(512);
            entity.Property(x => x.EmailDeliveryStatus).HasMaxLength(32);
            entity.Property(x => x.EmailDeliveryError).HasMaxLength(2048);
            entity.Property(x => x.GrandTotal).HasColumnType("decimal(18,3)");
            entity.HasIndex(x => x.PublicReference).IsUnique();
        });

        modelBuilder.Entity<OrderLine>(entity =>
        {
            entity.Property(x => x.UnitPrice).HasColumnType("decimal(18,3)");
            entity.Property(x => x.LineTotal).HasColumnType("decimal(18,3)");
            entity.Property(x => x.ItemCode).HasMaxLength(64);
            entity.Property(x => x.ItemImagePath).HasMaxLength(512);
        });

        modelBuilder.Entity<ImportBatch>(entity =>
        {
            entity.Property(x => x.SourceFileName).HasMaxLength(256);
            entity.Property(x => x.SourceFilePath).HasMaxLength(512);
            entity.Property(x => x.Status).HasMaxLength(32);
        });

        modelBuilder.Entity<ImportBatchItem>(entity =>
        {
            entity.Property(x => x.SourceItemId).HasMaxLength(64);
            entity.Property(x => x.PicoCode).HasMaxLength(64);
            entity.Property(x => x.Category).HasMaxLength(128);
            entity.Property(x => x.OriginalImagePath).HasMaxLength(512);
            entity.Property(x => x.PrimaryImagePath).HasMaxLength(512);
            entity.Property(x => x.CardImagePath).HasMaxLength(512);
            entity.Property(x => x.DetailImagePath).HasMaxLength(512);
            entity.Property(x => x.ThumbnailImagePath).HasMaxLength(512);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.PriceSourceReference).HasMaxLength(512);
            entity.Property(x => x.PriceMatchMethod).HasMaxLength(64);
            entity.Property(x => x.SuggestedPrice).HasColumnType("decimal(18,3)");
        });

        modelBuilder.Entity<PortalSetting>(entity =>
        {
            entity.Property(x => x.Key).HasMaxLength(128);
            entity.Property(x => x.Value).HasMaxLength(2048);
            entity.HasIndex(x => x.Key).IsUnique();
        });
    }
}
