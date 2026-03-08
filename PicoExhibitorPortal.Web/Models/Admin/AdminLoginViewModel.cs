using System.ComponentModel.DataAnnotations;

namespace PicoExhibitorPortal.Web.Models.Admin;

public sealed class AdminLoginViewModel
{
    [Required]
    [DataType(DataType.Password)]
    public string Password { get; set; } = string.Empty;

    public string ReturnUrl { get; set; } = "/Admin";
}
