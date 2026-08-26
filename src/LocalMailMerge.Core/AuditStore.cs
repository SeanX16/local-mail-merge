using System.Text.Json;

namespace LocalMailMerge.Core;

public sealed class AuditStore
{
    private static readonly SemaphoreSlim WriteLock = new(1, 1);
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public AuditStore(string? baseDirectory = null)
    {
        BaseDirectory = baseDirectory ?? ResolveDefaultBaseDirectory();
    }

    public string BaseDirectory { get; }
    public string AuditPath => Path.Combine(BaseDirectory, "audit.jsonl");

    private static string ResolveDefaultBaseDirectory()
    {
        var localApplicationData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var currentDirectory = Path.Combine(localApplicationData, "SeanX16", "LocalMailMerge");
        var legacyDirectory = Path.Combine(localApplicationData, "HKRC", "LocalMailMerge");
        return Directory.Exists(currentDirectory) || !Directory.Exists(legacyDirectory)
            ? currentDirectory
            : legacyDirectory;
    }

    public IReadOnlySet<string> LoadSuccessfulKeys()
    {
        if (!File.Exists(AuditPath))
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in File.ReadLines(AuditPath))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var entry = JsonSerializer.Deserialize<AuditEntry>(line, _jsonOptions);
                if (entry is not null && entry.Outcome.Equals("Success", StringComparison.OrdinalIgnoreCase))
                {
                    keys.Add(ContentHasher.BuildDeduplicationKey(entry.BatchId, entry.PersonId, entry.ContentHash));
                }
            }
            catch (JsonException)
            {
                // A damaged line is ignored; later valid audit lines remain usable.
            }
        }

        return keys;
    }

    public async Task AppendAsync(AuditEntry entry, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(BaseDirectory);
        var json = JsonSerializer.Serialize(entry, _jsonOptions);
        await WriteLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await File.AppendAllTextAsync(AuditPath, json + Environment.NewLine, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task<string> WriteReportAsync(
        string batchId,
        IReadOnlyList<DraftCreationResult> results,
        CancellationToken cancellationToken = default)
    {
        var reportDirectory = Path.Combine(BaseDirectory, "reports");
        Directory.CreateDirectory(reportDirectory);
        var safeBatch = string.Concat(batchId.Select(character => Path.GetInvalidFileNameChars().Contains(character) ? '_' : character));
        var reportPath = Path.Combine(reportDirectory, $"{safeBatch}_{DateTime.Now:yyyyMMdd_HHmmss}.json");
        var payload = new
        {
            batch_id = batchId,
            created_at = DateTimeOffset.Now,
            summary = new
            {
                success = results.Count(result => result.Outcome == "Success"),
                skipped = results.Count(result => result.Outcome == "Skipped"),
                failed = results.Count(result => result.Outcome == "Failed")
            },
            results = results.Select(result => new
            {
                person_id = result.PersonId,
                outcome = result.Outcome,
                outlook_entry_id = result.OutlookEntryId,
                error_code = result.ErrorCode,
                error_message = result.ErrorMessage
            })
        };

        await File.WriteAllTextAsync(
            reportPath,
            JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }),
            cancellationToken).ConfigureAwait(false);
        return reportPath;
    }
}
