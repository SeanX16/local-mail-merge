using System.Collections.ObjectModel;

namespace LocalMailMerge.Core;

public sealed class OutreachBatch
{
    public required string SchemaVersion { get; init; }
    public required string BatchId { get; init; }
    public required string SourcePath { get; init; }
    public required IReadOnlyList<ImportField> Fields { get; init; }
    public required IReadOnlyList<OutreachMessage> Messages { get; init; }
    public string SourceWorksheetName { get; init; } = string.Empty;
    public int? HeaderRowNumber { get; init; }
}

public sealed record XlsxImportOptions(string WorksheetName, int HeaderRowNumber);

public sealed record XlsxPreviewRow(int RowNumber, IReadOnlyList<string> Values);

public sealed record XlsxSheetInspection(
    string Name,
    int Index,
    int RowCount,
    int ColumnCount,
    int SuggestedHeaderRowNumber,
    int DataRowCount,
    IReadOnlyList<XlsxPreviewRow> PreviewRows);

public sealed record XlsxWorkbookInspection(
    string RecommendedWorksheetName,
    IReadOnlyList<XlsxSheetInspection> Sheets);

public sealed record ImportField(string Key, string DisplayName, bool DefaultVisible = false);

public sealed class OutreachMessage
{
    public required string BatchId { get; init; }
    public required string PersonId { get; init; }
    public required string RecipientName { get; init; }
    public required string RecipientEmail { get; init; }
    public required string Subject { get; init; }
    public required string BodyHtml { get; init; }
    public required string BodyText { get; init; }
    public required string TargetRole { get; init; }
    public required string ReviewStatus { get; init; }
    public required bool DoNotContact { get; init; }
    public required string DeclaredContentHash { get; init; }
    public required IReadOnlyList<PersonalizationFact> PersonalizationFacts { get; init; }
    public required IReadOnlyDictionary<string, string> Fields { get; init; }

    public string ComputedContentHash { get; set; } = string.Empty;
    public ValidationResult Validation { get; set; } = ValidationResult.NotValidated;
    public bool IsSelected { get; set; }

    public string EffectiveBodyHtml => !string.IsNullOrWhiteSpace(BodyHtml)
        ? BodyHtml
        : $"<div style=\"white-space:pre-wrap\">{System.Net.WebUtility.HtmlEncode(BodyText)}</div>";

    public string GetFieldValue(string key)
    {
        if (key == ValidationService.ValidationFieldKey)
        {
            return Validation.DisplayText;
        }

        if (!Fields.TryGetValue(key, out var value)) return string.Empty;
        var normalized = new string(key
            .Where(character => character is not '_' and not '-' && !char.IsWhiteSpace(character))
            .Select(char.ToLowerInvariant)
            .ToArray());
        if (normalized is "reviewstatus" or "审核状态" or "审核")
        {
            return value.ToLowerInvariant() switch
            {
                "approved" => "已批准",
                "needs review" => "待复核",
                "blocked" => "已拦截",
                _ => value
            };
        }

        return value;
    }
}

public sealed record PersonalizationFact(string Text, string SourceUrl);

public enum ValidationState
{
    NotValidated,
    Eligible,
    NeedsReview,
    Blocked,
    Duplicate
}

public enum ValidationIssueSeverity
{
    Warning,
    Blocking
}

public sealed record ValidationIssue(string Code, string Message, ValidationIssueSeverity Severity);

public sealed class ValidationResult
{
    public static ValidationResult NotValidated { get; } = new(ValidationState.NotValidated, []);

    public ValidationResult(ValidationState state, IReadOnlyList<ValidationIssue> issues)
    {
        State = state;
        Issues = new ReadOnlyCollection<ValidationIssue>(issues.ToList());
    }

    public ValidationState State { get; }
    public IReadOnlyList<ValidationIssue> Issues { get; }
    public bool CanCreate => State is ValidationState.Eligible or ValidationState.NeedsReview;
    public bool HasWarnings => Issues.Any(issue => issue.Severity == ValidationIssueSeverity.Warning);
    public bool HasBlockingIssues => Issues.Any(issue => issue.Severity == ValidationIssueSeverity.Blocking);

    public string DisplayText => State switch
    {
        ValidationState.Eligible => "可创建",
        ValidationState.NeedsReview => "有警告",
        ValidationState.Blocked => "已拦截",
        ValidationState.Duplicate => "重复",
        _ => "未校验"
    };

    public string DetailText => Issues.Count == 0
        ? "校验通过"
        : string.Join(Environment.NewLine, Issues.Select(issue => $"• {issue.Message}"));
}

public sealed record AuditEntry(
    string BatchId,
    string PersonId,
    string ContentHash,
    string OutlookEntryId,
    DateTimeOffset CreatedAt,
    string Outcome,
    string ErrorCode,
    string ErrorMessage);

public sealed record DraftCreationResult(
    string PersonId,
    string Outcome,
    string OutlookEntryId,
    string ErrorCode,
    string ErrorMessage);
