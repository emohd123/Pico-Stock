namespace PicoExhibitorPortal.Web.Infrastructure.Importing;

public static class AuthoritativeRateSheetOverrides
{
    public const string SourceTag = "manual-rate-sheet-2026-03-08";

    public static IReadOnlyList<PriceSheetEntry> Entries { get; } =
    [
        Entry("1534", "FVCHIKEWHT", 1m),
        Entry("1455", "FPVCCHRW1", 1m),
        Entry("1451", "FPVCCHRB", 1m),
        Entry("1454", "FPVCCHRR", 1m),
        Entry("4279", "FPVCCHRR1", 1m),
        Entry("4280", "FPVCCHRO", 1m),
        Entry("4281", "FPVCCHRW2", 1m),
        Entry("4282", "FPVCCHRG", 1m),
        Entry("1530", "FVCHBLU1", 0.500m),
        Entry("1524", "FVCHBLK1", 0.500m),
        Entry("1439", "FLEDPCHR", 30m),
        Entry("1373", "FBEANBAGSB1", 5m),
        Entry("1374", "FBEANBAGSB1", 5m),
        Entry("1514", "FSSFAGRY2", 15m),
        Entry("1519", "FSSSOFABLK1", 15m),
        Entry("4412", "FSSOSADGREY", 12m),
        Entry("1507", "FSSOFABEIGE1", 28m),
        Entry("5119", "FSSOFABEIGE3", 25m),
        Entry("5120", "FSSOFAWHT3", 20m),
        Entry("5121", "FSSOFABW", 20m),
        Entry("4938", "FSSOFABEIGE2", 20m),
        Entry("1541", "FVIPCHR1", 25m),
        Entry("1435", "FHSWHT04", 15m),
        Entry("1422", "FHSBLK01", 12m),
        Entry("4675", "FHSWHT05", 15m),
        Entry("1440", "FLSBLK01", 5m),
        Entry("1452", "FPVCCHRGRY", 6m),
        Entry("1456", "FPVCCHRW2", 6m),
        Entry("4447", "FVRCHRIKEA", 15m),
        Entry("5085", "FVCHRGRY", 12m),
        Entry("5014", "FVCHWHT1", 10m),
        Entry("1384", "FEXECHRB", 21m),
        Entry("1417", "FHBARTBL3", 18m),
        Entry("1419", "FHGTBL", 18m),
        Entry("4405", "FHGTBLA", 18m),
        Entry("1413", "FGRTBL4", 15m),
        Entry("1494", "FRWTBL", 12m),
        Entry("1548", "FWSTBL", 10m),
        Entry("1436", "FIKEAMTBL", 12m),
        Entry("1405", "FGCTBL3", 12m),
        Entry("1406", "FGCTBL4", 10m),
        Entry("4663", "FGCTBL5", 12m),
        Entry("5081", "FACTBL", 10m),
        Entry("4411", "FIKEACTBL", 12m)
    ];

    public static IReadOnlySet<string> OverrideCodes { get; } = Entries
        .Select(x => x.PicoCode.ToUpperInvariant())
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    public static IReadOnlySet<string> OverrideSourceIds { get; } = Entries
        .Select(x => x.SourceItemId)
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static PriceSheetEntry Entry(string sourceItemId, string picoCode, decimal unitRate) =>
        new()
        {
            SourceItemId = sourceItemId,
            PicoCode = picoCode,
            UnitRate = unitRate,
            SourceReference = $"{SourceTag}:id-{sourceItemId}:code-{picoCode}"
        };
}
