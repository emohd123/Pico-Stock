using System.Globalization;
using Microsoft.AspNetCore.Localization;
using Microsoft.EntityFrameworkCore;
using PicoExhibitorPortal.Web.Data;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;
using PicoExhibitorPortal.Web.Infrastructure.Email;
using PicoExhibitorPortal.Web.Infrastructure.Importing;
using PicoExhibitorPortal.Web.Infrastructure.Localization;
using PicoExhibitorPortal.Web.Infrastructure.Orders;
using PicoExhibitorPortal.Web.Infrastructure.Session;
using PicoExhibitorPortal.Web.Infrastructure.Admin;
using PicoExhibitorPortal.Web.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection(EmailOptions.SectionName));
builder.Services.Configure<SeedSourceOptions>(builder.Configuration.GetSection(SeedSourceOptions.SectionName));
builder.Services.Configure<AdminAccessOptions>(builder.Configuration.GetSection(AdminAccessOptions.SectionName));

var databaseProvider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
var connectionString = string.Equals(databaseProvider, "Postgres", StringComparison.OrdinalIgnoreCase)
        || string.Equals(databaseProvider, "PostgreSql", StringComparison.OrdinalIgnoreCase)
        || string.Equals(databaseProvider, "Supabase", StringComparison.OrdinalIgnoreCase)
    ? builder.Configuration.GetConnectionString("SupabaseConnection")
        ?? builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Data Source=pico-portal.db"
    : builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Data Source=pico-portal.db";

builder.Services.AddDbContext<PortalDbContext>(options =>
{
    if (string.Equals(databaseProvider, "SqlServer", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlServer(connectionString);
        return;
    }

    if (string.Equals(databaseProvider, "Postgres", StringComparison.OrdinalIgnoreCase)
        || string.Equals(databaseProvider, "PostgreSql", StringComparison.OrdinalIgnoreCase)
        || string.Equals(databaseProvider, "Supabase", StringComparison.OrdinalIgnoreCase))
    {
        options.UseNpgsql(connectionString);
        return;
    }

    options.UseSqlite(connectionString);
});
builder.Services.AddLocalization();
builder.Services.AddHttpContextAccessor();
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.Cookie.Name = ".PicoExhibitorPortal.Session";
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.IdleTimeout = TimeSpan.FromHours(12);
});
builder.Services.AddControllersWithViews();

builder.Services.AddScoped<IUiTextService, UiTextService>();
builder.Services.AddScoped<ICatalogService, CatalogService>();
builder.Services.AddScoped<IImageVariantService, ImageVariantService>();
builder.Services.AddScoped<ICartService, SessionCartService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<IOrderDocumentService, PdfOrderDocumentService>();
builder.Services.AddScoped<IPortalSettingsService, PortalSettingsService>();
builder.Services.AddScoped<ICatalogImportService, CatalogImportService>();
builder.Services.AddScoped<IPriceSheetParser, PdfPriceSheetParser>();
builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.AddHostedService<CatalogBootstrapHostedService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PortalDbContext>();
    await PortalDatabaseBootstrapper.InitializeAsync(db);
}

var supportedCultures = new[]
{
    new CultureInfo("en"),
    new CultureInfo("ar")
};

app.UseRequestLocalization(new RequestLocalizationOptions
{
    DefaultRequestCulture = new RequestCulture("en"),
    SupportedCultures = supportedCultures,
    SupportedUICultures = supportedCultures,
    RequestCultureProviders =
    {
        new CookieRequestCultureProvider()
    }
});

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.MapStaticAssets();
app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.Use(async (context, next) =>
{
    if (!context.Request.Path.StartsWithSegments("/Admin", out var remainingPath))
    {
        await next();
        return;
    }

    if (context.Request.Path.StartsWithSegments(AdminAccessConstants.AuthPathPrefix, StringComparison.OrdinalIgnoreCase))
    {
        await next();
        return;
    }

    if (context.Session.GetString(AdminAccessConstants.SessionKey) == "1")
    {
        await next();
        return;
    }

    var returnUrl = $"{context.Request.Path}{context.Request.QueryString}";
    var loginUrl = $"/Admin/Auth/Login?returnUrl={Uri.EscapeDataString(returnUrl)}";
    context.Response.Redirect(loginUrl);
});
app.UseAuthorization();

app.MapControllerRoute(
    name: "areas",
    pattern: "{area:exists}/{controller=Catalog}/{action=Index}/{id?}");

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}")
    .WithStaticAssets();

app.Run();

public partial class Program;
