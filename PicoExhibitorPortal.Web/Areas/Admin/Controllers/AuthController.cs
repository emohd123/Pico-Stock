using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using PicoExhibitorPortal.Web.Infrastructure.Admin;
using PicoExhibitorPortal.Web.Models.Admin;
using PicoExhibitorPortal.Web.Options;

namespace PicoExhibitorPortal.Web.Areas.Admin.Controllers;

[Area("Admin")]
public sealed class AuthController(IOptions<AdminAccessOptions> adminOptions) : Controller
{
    [HttpGet]
    public IActionResult Login(string? returnUrl = null)
    {
        if (HttpContext.Session.GetString(AdminAccessConstants.SessionKey) == "1")
        {
            return LocalRedirect(NormalizeReturnUrl(returnUrl));
        }

        return View(new AdminLoginViewModel
        {
            ReturnUrl = NormalizeReturnUrl(returnUrl)
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Login(AdminLoginViewModel model)
    {
        model.ReturnUrl = NormalizeReturnUrl(model.ReturnUrl);
        if (!ModelState.IsValid)
        {
            return View(model);
        }

        if (!string.Equals(model.Password, adminOptions.Value.Password, StringComparison.Ordinal))
        {
            ModelState.AddModelError(nameof(model.Password), "Incorrect admin password.");
            return View(model);
        }

        HttpContext.Session.SetString(AdminAccessConstants.SessionKey, "1");
        return LocalRedirect(model.ReturnUrl);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Logout()
    {
        HttpContext.Session.Remove(AdminAccessConstants.SessionKey);
        return RedirectToAction(nameof(Login));
    }

    private string NormalizeReturnUrl(string? returnUrl)
    {
        if (string.IsNullOrWhiteSpace(returnUrl) || !Url.IsLocalUrl(returnUrl))
        {
            return AdminAccessConstants.DefaultReturnUrl;
        }

        return returnUrl;
    }
}
