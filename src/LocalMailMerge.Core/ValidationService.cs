using System.Text.RegularExpressions;

namespace LocalMailMerge.Core;

public sealed partial class ValidationService
{
    public const string ValidationFieldKey = "__validation_result";

    public void Validate(
        OutreachBatch batch,
        IReadOnlySet<string> successfulKeys,
        ValidationPolicy? policy = null)
    {
        policy ??= ValidationPolicy.Default;
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
                AddConfigured(issues, policy, "review_not_approved", "审核状态不是 Approved，请人工确认。 ");
            }

            if (string.IsNullOrWhiteSpace(message.RecipientEmail) ||
                message.RecipientEmail.Equals("Unknown", StringComparison.OrdinalIgnoreCase) ||
                !EmailRegex().IsMatch(message.RecipientEmail))
            {
                AddBlocking(issues, "invalid_email", "邮箱缺失、无效或仍为 Unknown。 ");
            }

            if (string.IsNullOrWhiteSpace(message.Subject))
            {
                AddConfigured(issues, policy, "missing_subject", "邮件主题为空，草稿创建后需要补充。 ");
            }

            var body = !string.IsNullOrWhiteSpace(message.BodyHtml) ? message.BodyHtml : message.BodyText;
            if (string.IsNullOrWhiteSpace(body))
            {
                AddConfigured(issues, policy, "missing_body", "邮件正文为空，草稿创建后需要补充。 ");
            }
            else if (PlaceholderRegex().IsMatch(body) || PlaceholderRegex().IsMatch(message.Subject))
            {
                AddConfigured(issues, policy, "unresolved_placeholder", "主题或正文仍含未替换占位符，请在发送前处理。 ");
            }

            if (message.PersonalizationFacts.Count == 0)
            {
                AddConfigured(issues, policy, "missing_personalization_source", "邮件没有提供个性化事实。 ");
            }

            if (!string.IsNullOrWhiteSpace(message.DeclaredContentHash) &&
                !message.DeclaredContentHash.Equals(message.ComputedContentHash, StringComparison.OrdinalIgnoreCase))
            {
                AddConfigured(issues, policy, "content_hash_mismatch", "审核后邮箱、主题或正文发生了变化。 ");
            }

            if (duplicatedPeople.Contains(message.PersonId.Trim()))
            {
                AddBlocking(issues, "duplicate_person", "同一批次存在重复 person_id，无法确定用户选择对应哪条记录。 ");
            }

            if (duplicatedEmails.Contains(message.RecipientEmail.Trim()))
            {
                AddConfigured(issues, policy, "duplicate_email", "同一批次存在重复邮箱，请确认是否确实需要多封草稿。 ");
            }

            var dedupeKey = ContentHasher.BuildDeduplicationKey(message.BatchId, message.PersonId, message.ComputedContentHash);
            var alreadyCreated = successfulKeys.Contains(dedupeKey);
            if (alreadyCreated)
            {
                AddConfigured(issues, policy, "already_created", "相同批次、人员和内容已成功创建过草稿。 ");
            }

            if (alreadyCreated && policy.GetLevel("already_created") == ValidationRuleLevel.Blocking)
            {
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

    private static void AddConfigured(
        List<ValidationIssue> issues,
        ValidationPolicy policy,
        string code,
        string message)
    {
        switch (policy.GetLevel(code))
        {
            case ValidationRuleLevel.Warning:
                AddWarning(issues, code, message);
                break;
            case ValidationRuleLevel.Blocking:
                AddBlocking(issues, code, message);
                break;
        }
    }

    private static bool IsApproved(string value) =>
        value.Equals("Approved", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("已批准", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("批准", StringComparison.OrdinalIgnoreCase);

    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.CultureInvariant)]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"\{[A-Za-z][^{}]*\}", RegexOptions.CultureInvariant)]
    private static partial Regex PlaceholderRegex();
}
