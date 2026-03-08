using Microsoft.AspNetCore.Mvc;
using PicoExhibitorPortal.Web.Infrastructure.Catalog;
using PicoExhibitorPortal.Web.Models.Catalog;

namespace PicoExhibitorPortal.Web.Areas.Admin.Controllers;

[Area("Admin")]
public sealed class CatalogController(ICatalogService catalogService, IWebHostEnvironment environment) : Controller
{
    public async Task<IActionResult> Index(CancellationToken cancellationToken) =>
        View(await catalogService.GetAdminCatalogAsync(cancellationToken));

    public IActionResult Create() =>
        View("Edit", new AdminCatalogEditViewModel
        {
            Currency = "BHD",
            IsActive = true,
            IsVerified = true
        });

    public async Task<IActionResult> Edit(int id, CancellationToken cancellationToken)
    {
        var item = await catalogService.GetByIdAsync(id, cancellationToken);
        if (item is null)
        {
            return NotFound();
        }

        return View(new AdminCatalogEditViewModel
        {
            Id = item.Id,
            SourceItemId = item.SourceItemId,
            NameEn = item.NameEn,
            NameAr = item.NameAr,
            CategoryEn = item.CategoryEn,
            CategoryAr = item.CategoryAr,
            DescriptionEn = item.DescriptionEn,
            DescriptionAr = item.DescriptionAr,
            DimensionsAndSpecsEn = item.DimensionsAndSpecsEn,
            DimensionsAndSpecsAr = item.DimensionsAndSpecsAr,
            PrimaryImagePath = item.PrimaryImagePath,
            Price = item.Price,
            Currency = item.Currency,
            IsActive = item.IsActive,
            IsVerified = item.IsVerified,
            PicoCode = item.PicoCode,
            SourceDocumentReference = item.SourceDocumentReference
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(AdminCatalogEditViewModel model, CancellationToken cancellationToken)
    {
        if (model.ImageUpload is not null && model.ImageUpload.Length > 0)
        {
            model.PrimaryImagePath = await SaveUploadedImageAsync(model.ImageUpload, cancellationToken);
        }

        if (!ModelState.IsValid)
        {
            return View(model);
        }

        if (model.Id == 0)
        {
            await catalogService.CreateCatalogItemAsync(new PicoExhibitorPortal.Web.Domain.CatalogItem
            {
                NameEn = model.NameEn,
                NameAr = model.NameAr,
                CategoryEn = model.CategoryEn,
                CategoryAr = model.CategoryAr,
                DescriptionEn = model.DescriptionEn,
                DescriptionAr = model.DescriptionAr,
                DimensionsAndSpecsEn = model.DimensionsAndSpecsEn,
                DimensionsAndSpecsAr = model.DimensionsAndSpecsAr,
                PrimaryImagePath = model.PrimaryImagePath,
                Price = model.Price,
                Currency = model.Currency,
                IsActive = model.IsActive,
                IsVerified = model.IsVerified,
                PicoCode = model.PicoCode,
                SourceItemId = model.SourceItemId,
                SourceDocumentReference = model.SourceDocumentReference
            }, cancellationToken);
            return RedirectToAction(nameof(Index));
        }

        var item = await catalogService.GetByIdAsync(model.Id, cancellationToken);
        if (item is null)
        {
            return NotFound();
        }

        item.NameEn = model.NameEn;
        item.NameAr = model.NameAr;
        item.CategoryEn = model.CategoryEn;
        item.CategoryAr = model.CategoryAr;
        item.DescriptionEn = model.DescriptionEn;
        item.DescriptionAr = model.DescriptionAr;
        item.DimensionsAndSpecsEn = model.DimensionsAndSpecsEn;
        item.DimensionsAndSpecsAr = model.DimensionsAndSpecsAr;
        item.PrimaryImagePath = model.PrimaryImagePath;
        item.Price = model.Price;
        item.Currency = model.Currency;
        item.IsActive = model.IsActive;
        item.IsVerified = model.IsVerified;
        item.PicoCode = model.PicoCode;
        item.SourceItemId = model.SourceItemId;
        item.SourceDocumentReference = model.SourceDocumentReference;

        await catalogService.UpdateCatalogItemAsync(item, cancellationToken);
        return RedirectToAction(nameof(Index));
    }

    private async Task<string> SaveUploadedImageAsync(IFormFile file, CancellationToken cancellationToken)
    {
        var extension = Path.GetExtension(Path.GetFileName(file.FileName));
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = ".png";
        }

        var allowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".gif",
            ".svg"
        };

        if (!allowedExtensions.Contains(extension))
        {
            throw new InvalidOperationException("Unsupported image file type.");
        }

        var folder = Path.Combine(environment.WebRootPath, "uploads", "manual-catalog");
        Directory.CreateDirectory(folder);
        var fileName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var physicalPath = Path.Combine(folder, fileName);

        await using var stream = new FileStream(physicalPath, FileMode.Create);
        await file.CopyToAsync(stream, cancellationToken);

        return $"/uploads/manual-catalog/{fileName}";
    }
}
