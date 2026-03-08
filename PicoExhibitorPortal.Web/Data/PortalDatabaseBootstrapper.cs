using System.Data.Common;
using Microsoft.EntityFrameworkCore;

namespace PicoExhibitorPortal.Web.Data;

public static class PortalDatabaseBootstrapper
{
    public static async Task InitializeAsync(PortalDbContext dbContext, CancellationToken cancellationToken = default)
    {
        await dbContext.Database.EnsureCreatedAsync(cancellationToken);

        await EnsureColumnAsync(dbContext, "CatalogItems", "OriginalImagePath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "CatalogItems", "CardImagePath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "CatalogItems", "DetailImagePath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "CatalogItems", "ThumbnailImagePath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "CatalogItems", "PriceSourceReference", "TEXT", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "CatalogItems", "OriginalImagePath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "CatalogItems", "CardImagePath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "CatalogItems", "DetailImagePath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "CatalogItems", "ThumbnailImagePath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "CatalogItems", "PriceSourceReference", cancellationToken);

        await EnsureColumnAsync(dbContext, "ImportBatchItems", "OriginalImagePath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "ImportBatchItems", "CardImagePath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "ImportBatchItems", "DetailImagePath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "ImportBatchItems", "ThumbnailImagePath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "ImportBatchItems", "PriceSourceReference", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "ImportBatchItems", "PriceMatchMethod", "TEXT", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "ImportBatchItems", "OriginalImagePath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "ImportBatchItems", "CardImagePath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "ImportBatchItems", "DetailImagePath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "ImportBatchItems", "ThumbnailImagePath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "ImportBatchItems", "PriceSourceReference", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "ImportBatchItems", "PriceMatchMethod", cancellationToken);

        await EnsureColumnAsync(dbContext, "Orders", "PdfPath", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "Orders", "PdfGeneratedAtUtc", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "Orders", "CustomerNotifiedAtUtc", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "Orders", "EmailDeliveryStatus", "TEXT", cancellationToken);
        await EnsureColumnAsync(dbContext, "Orders", "EmailDeliveryError", "TEXT", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "Orders", "PdfPath", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "Orders", "EmailDeliveryStatus", cancellationToken);
        await NormalizeNullTextColumnAsync(dbContext, "Orders", "EmailDeliveryError", cancellationToken);
    }

    private static async Task EnsureColumnAsync(
        PortalDbContext dbContext,
        string tableName,
        string columnName,
        string sqliteColumnType,
        CancellationToken cancellationToken)
    {
        if (await ColumnExistsAsync(dbContext, tableName, columnName, cancellationToken))
        {
            return;
        }

        if (dbContext.Database.IsSqlite())
        {
#pragma warning disable EF1002
            await dbContext.Database.ExecuteSqlRawAsync(
                $"ALTER TABLE {tableName} ADD COLUMN {columnName} {sqliteColumnType}",
                cancellationToken);
#pragma warning restore EF1002
            return;
        }

        if (dbContext.Database.IsSqlServer())
        {
#pragma warning disable EF1002
            await dbContext.Database.ExecuteSqlRawAsync(
                $"ALTER TABLE {tableName} ADD {columnName} NVARCHAR(512) NULL",
                cancellationToken);
#pragma warning restore EF1002
            return;
        }

        if (dbContext.Database.IsNpgsql())
        {
#pragma warning disable EF1002
            await dbContext.Database.ExecuteSqlRawAsync(
                $"ALTER TABLE \"{tableName}\" ADD COLUMN \"{columnName}\" TEXT NULL",
                cancellationToken);
#pragma warning restore EF1002
        }
    }

    private static async Task<bool> ColumnExistsAsync(
        PortalDbContext dbContext,
        string tableName,
        string columnName,
        CancellationToken cancellationToken)
    {
        await using var connection = dbContext.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        if (dbContext.Database.IsSqlite())
        {
            command.CommandText = $"PRAGMA table_info({tableName})";
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                if (string.Equals(reader.GetString(1), columnName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        command.CommandText = """
            SELECT COUNT(*)
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
            """;

        AddParameter(command, "@tableName", tableName);
        AddParameter(command, "@columnName", columnName);
        var result = (int)(await command.ExecuteScalarAsync(cancellationToken) ?? 0);
        return result > 0;
    }

    private static async Task NormalizeNullTextColumnAsync(
        PortalDbContext dbContext,
        string tableName,
        string columnName,
        CancellationToken cancellationToken)
    {
        if (!await ColumnExistsAsync(dbContext, tableName, columnName, cancellationToken))
        {
            return;
        }

        if (dbContext.Database.IsSqlite())
        {
#pragma warning disable EF1002
            await dbContext.Database.ExecuteSqlRawAsync(
                $"UPDATE {tableName} SET {columnName} = '' WHERE {columnName} IS NULL",
                cancellationToken);
#pragma warning restore EF1002
            return;
        }

        if (dbContext.Database.IsSqlServer())
        {
#pragma warning disable EF1002
            await dbContext.Database.ExecuteSqlRawAsync(
                $"UPDATE {tableName} SET {columnName} = N'' WHERE {columnName} IS NULL",
                cancellationToken);
#pragma warning restore EF1002
            return;
        }

        if (dbContext.Database.IsNpgsql())
        {
#pragma warning disable EF1002
            await dbContext.Database.ExecuteSqlRawAsync(
                $"UPDATE \"{tableName}\" SET \"{columnName}\" = '' WHERE \"{columnName}\" IS NULL",
                cancellationToken);
#pragma warning restore EF1002
        }
    }

    private static void AddParameter(DbCommand command, string name, string value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
