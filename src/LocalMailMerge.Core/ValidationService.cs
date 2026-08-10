using System.Text.RegularExpressions;

namespace LocalMailMerge.Core;

public sealed partial class ValidationService
{
    public const string ValidationFieldKey = "__validation_result";

    public void Validate(OutreachBatch batch, IReadOnlySet<string> successfulKeys)
    {
        foreach (var message in batch.Messages)
        {
            message.ComputedContentHash = ContentHasher.Compute(message);
        }

        var duplicatedPeople = batch.Messages
            .Where(message => !string.IsNullOrWhiteSpace(message.PersonId))
            .GroupBy(message => message.PersonId.Trim(), StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var duplicatedEmails = batch.Messages
            .Where(message => !string.IsNullOrWhiteSpace(message.RecipientEmail))
            .GroupBy(message => message.RecipientEmail.Trim(), StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var message in batch.Messages)
        {
            var issues = new List<ValidationIssue>();
            if (!IsApproved(message.ReviewStatus))
            {
                AddWarning(issues, "review_not_approved", "审核状态不是 Approved，请在发送前人工确认。 ");
            }

            if (message.DoNotContact)
            {
                AddBlocking(issues, "do_not_contact", "记录被明确标记为禁止联系。 ");
            }

            if (string.IsNullOrWhiteSpace(message.RecipientEmail) ||
                message.RecipientEmail.Equals("Unknown", StringComparison.OrdinalIgnoreCase) ||
                !EmailRegex().IsMatch(message.RecipientEmail))
            {
                AddBlocking(issues, "invalid_email", "邮箱缺失、无效或仍为 Unknown。 ");
            }

            if (string.IsNullOrWhiteSpace(message.Subject))
            {
                AddWarning(issues, "missing_subject", "邮件主题为空，草稿创建后需要补充。 ");
            }

            var body = !string.IsNullOrWhiteSpace(message.BodyHtml) ? message.BodyHtml : message.BodyText;
            if (string.IsNullOrWhiteSpace(body))
            {
                AddWarning(issues, "missing_body", "邮件正文为空，草稿创建后需要补充。 ");
            }
            else if (PlaceholderRegex().IsMatch(body) || PlaceholderRegex().IsMatch(message.Subject))
            {
                AddWarning(issues, "unresolved_placeholder", "主题或正文仍含未替换占位符，请在发送前处理。 ");
            }

            if (message.PersonalizationFacts.Count == 0)
            {
                AddWarning(issues, "missing_personalization_source", "缺少个性化事实及其来源。 ");
            }
            else if (message.PersonalizationFacts.Any(fact => string.IsNullOrWhiteSpace(fact.SourceUrl)))
            {
                AddWarning(issues, "missing_source_url", "至少一条个性化事实缺少 source_url。 ");
            }

            if (string.IsNullOrWhiteSpace(message.DeclaredContentHash))
            {
                AddWarning(issues, "missing_content_hash", "交接包缺少 content_hash，无法确认内容版本。 ");
            }
            else if (!message.DeclaredContentHash.Equals(message.ComputedContentHash, StringComparison.OrdinalIgnoreCase))
            {
                AddBlocking(issues, "content_hash_mismatch", "content_hash 与当前收件人、主题和正文不一致，请重新审核交接包。 ");
            }

            if (duplicatedPeople.Contains(message.PersonId.Trim()))
            {
                AddBlocking(issues, "duplicate_person", "同一批次存在重复 person_id，无法确定用户选择对应哪条记录。 ");
            }

            if (duplicatedEmails.Contains(message.RecipientEmail.Trim()))
            {
                AddWarning(issues, "duplicate_email", "同一批次存在重复邮箱，请确认是否确实需要多封草稿。 ");
            }

            var dedupeKey = ContentHasher.BuildDeduplicationKey(message.BatchId, message.PersonId, message.ComputedContentHash);
            if (successfulKeys.Contains(dedupeKey))
            {
                AddBlocking(issues, "already_created", "相同批次、人员和内容已成功创建过草稿。 ");
                message.Validation = new ValidationResult(ValidationState.Duplicate, issues);
            }
            else if (issues.Any(issue => issue.Severity == ValidationIssueSeverity.Blocking))
            {
                message.Validation = new ValidationResult(ValidationState.Blocked, issues);
            }
            else if (issues.Count > 0)
            {
                message.Validation = new ValidationResult(ValidationState.NeedsReview, issues);
            }
            else
            {
                message.Validation = new ValidationResult(ValidationState.Eligible, []);
            }

            message.IsSelected = message.Validation.State == ValidationState.Eligible;
        }
    }

    private static void AddWarning(List<ValidationIssue> issues, string code, string message) =>
        issues.Add(new ValidationIssue(code, message.Trim(), ValidationIssueSeverity.Warning));

    private static void AddBlocking(List<ValidationIssue> issues, string code, string message) =>
        issues.Add(new ValidationIssue(code, message.Trim(), ValidationIssueSeverity.Blocking));

    private static bool IsApproved(string value) =>
        value.Equals("Approved", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("已批准", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("批准", StringComparison.OrdinalIgnoreCase);

    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.CultureInvariant)]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"\{[A-Za-z][^{}]*\}", RegexOptions.CultureInvariant)]
    private static partial Regex PlaceholderRegex();
}
