namespace LocalMailMerge.Core;

public enum ValidationRuleLevel
{
    Pass,
    Warning,
    Blocking
}

public sealed class ValidationPolicy
{
    private static readonly IReadOnlyDictionary<string, ValidationRuleLevel> DefaultRules =
        new Dictionary<string, ValidationRuleLevel>(StringComparer.OrdinalIgnoreCase)
        {
            ["invalid_email"] = ValidationRuleLevel.Blocking,
            ["already_created"] = ValidationRuleLevel.Blocking,
            ["missing_subject"] = ValidationRuleLevel.Blocking,
            ["missing_body"] = ValidationRuleLevel.Blocking,
            ["unresolved_placeholder"] = ValidationRuleLevel.Warning,
            ["duplicate_email"] = ValidationRuleLevel.Warning,
            ["review_not_approved"] = ValidationRuleLevel.Pass,
            ["missing_personalization_source"] = ValidationRuleLevel.Pass,
            ["content_hash_mismatch"] = ValidationRuleLevel.Pass
        };

    private readonly IReadOnlyDictionary<string, ValidationRuleLevel> _rules;

    public ValidationPolicy(IReadOnlyDictionary<string, ValidationRuleLevel>? rules = null)
    {
        var normalized = new Dictionary<string, ValidationRuleLevel>(DefaultRules, StringComparer.OrdinalIgnoreCase);
        if (rules is not null)
        {
            foreach (var (code, level) in rules)
            {
                if (normalized.ContainsKey(code)) normalized[code] = level;
            }
        }

        // 邮箱无效是创建 Outlook 草稿前不可关闭的地址完整性检查。
        normalized["invalid_email"] = ValidationRuleLevel.Blocking;
        _rules = normalized;
    }

    public static ValidationPolicy Default { get; } = new();

    public ValidationRuleLevel GetLevel(string code) =>
        _rules.TryGetValue(code, out var level) ? level : ValidationRuleLevel.Pass;
}
