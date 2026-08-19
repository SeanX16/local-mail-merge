using System.Net;
using System.Text.RegularExpressions;

namespace LocalMailMerge.Core;

public sealed record SignatureInspectionIssue(string Code, string Message, string Severity);

public sealed record SignatureInspectionResult(
    string Kind,
    string PreviewHtml,
    bool PreviewComplete,
    string Subject,
    string To,
    string Cc,
    string Bcc,
    IReadOnlyList<string> InlineAttachments,
    IReadOnlyList<string> RegularAttachments,
    IReadOnlyList<SignatureInspectionIssue> Issues)
{
    public bool CanUse => Issues.All(issue => !issue.Severity.Equals("blocking", StringComparison.OrdinalIgnoreCase));
}

public static partial class SignatureTemplateInspector
{
    private const int MaximumPreviewCharacters = 2_000_000;

    public static SignatureInspectionResult InspectHtmlFile(string path)
    {
        if (!File.Exists(path)) throw new FileNotFoundException("邮件签名文件不存在。", path);
        var html = File.ReadAllText(path);
        return FromHtml("html", html, previewComplete: true);
    }

    public static SignatureInspectionResult FromHtml(
        string kind,
        string html,
        bool previewComplete,
        string subject = "",
        string to = "",
        string cc = "",
        string bcc = "",
        IReadOnlyList<string>? inlineAttachments = null,
        IReadOnlyList<string>? regularAttachments = null)
    {
        var inlineItems = inlineAttachments ?? ImageSourceRegex().Matches(WebUtility.HtmlDecode(html))
            .Select(match => match.Groups["value"].Value.Trim())
            .Where(value => value.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
            .Select((_, index) => $"HTML 内嵌图片 {index + 1}")
            .ToList();
        var regularItems = regularAttachments ?? [];
        var issues = InspectHtmlContent(html)
            .Where(issue => !(kind.Equals("oft", StringComparison.OrdinalIgnoreCase)
                && inlineItems.Count > 0
                && issue.Code == "unresolved_image"))
            .ToList();

        if (!string.IsNullOrWhiteSpace(to) || !string.IsNullOrWhiteSpace(cc) || !string.IsNullOrWhiteSpace(bcc))
        {
            issues.Add(new SignatureInspectionIssue(
                "template_recipients",
                "模板含有收件人、抄送或密送；创建草稿时会全部清空并改用交接包中的收件人。",
                "warning"));
        }

        if (!string.IsNullOrWhiteSpace(subject))
        {
            issues.Add(new SignatureInspectionIssue(
                "template_subject",
                "模板含有主题；创建草稿时会由交接包中的主题覆盖。",
                "warning"));
        }

        if (regularItems.Count > 0)
        {
            issues.Add(new SignatureInspectionIssue(
                "template_regular_attachments",
                $"模板含有 {regularItems.Count} 个普通附件。请移除后重新导入，避免意外带入候选人邮件。",
                "blocking"));
        }

        var hasStyleSheet = StyleElementRegex().IsMatch(html);
        if (hasStyleSheet)
        {
            issues.Add(new SignatureInspectionIssue(
                "stylesheet_preview_limited",
                "签名包含样式表。为避免影响 APP 界面，预览只保留安全的行内样式；请在 Outlook 测试草稿中确认最终排版。",
                "warning"));
        }

        var fullPreview = previewComplete && !hasStyleSheet && html.Length <= MaximumPreviewCharacters;
        if (html.Length > MaximumPreviewCharacters)
        {
            issues.Add(new SignatureInspectionIssue(
                "preview_too_large",
                "签名内容过大，APP 不在界面中展开完整预览；请创建无收件人的测试草稿，在 Outlook 中核对。",
                "warning"));
        }

        return new SignatureInspectionResult(
            kind,
            html.Length <= MaximumPreviewCharacters ? html : string.Empty,
            fullPreview,
            subject,
            to,
            cc,
            bcc,
            inlineItems,
            regularItems,
            issues);
    }

    public static IReadOnlyList<SignatureInspectionIssue> InspectHtmlContent(string html)
    {
        var issues = new List<SignatureInspectionIssue>();
        if (string.IsNullOrWhiteSpace(html))
        {
            issues.Add(new SignatureInspectionIssue("empty_signature", "签名内容为空。", "blocking"));
            return issues;
        }

        var normalizedHtml = WebUtility.HtmlDecode(html);
        AddBlockingIssue(issues, ForbiddenElementRegex().IsMatch(normalizedHtml), "unsafe_element", "签名包含脚本、表单、嵌入页面或外部样式等不允许的 HTML 元素。");
        AddBlockingIssue(issues, EventHandlerRegex().IsMatch(normalizedHtml), "unsafe_event_handler", "签名包含 onload、onclick 等可执行事件属性。");
        AddBlockingIssue(issues, UnsafeUriRegex().IsMatch(normalizedHtml), "unsafe_uri", "签名包含 javascript、vbscript 或可执行 data URI。");
        AddBlockingIssue(issues, UnsafeCssRegex().IsMatch(normalizedHtml), "unsafe_css", "签名包含可执行或不安全的 CSS 表达式。");

        var imageSources = ImageSourceRegex().Matches(normalizedHtml)
            .Select(match => match.Groups["value"].Value.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();
        if (imageSources.Any(source => source.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || source.StartsWith("https://", StringComparison.OrdinalIgnoreCase)))
        {
            issues.Add(new SignatureInspectionIssue(
                "remote_image",
                "签名引用了远程图片。APP 预览不会加载它；收件人的邮件客户端也可能拦截或用于远程追踪。",
                "warning"));
        }

        if (imageSources.Any(source => !source.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)
            && !source.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            && !source.StartsWith("https://", StringComparison.OrdinalIgnoreCase)))
        {
            issues.Add(new SignatureInspectionIssue(
                "unresolved_image",
                "HTML 签名引用了本地、相对路径或 CID 图片。导入器会打包同一文件夹内可读取的图片；缺失图片或 CID 图片需要改用自包含 HTML 或含内嵌资源的 .oft。",
                "warning"));
        }

        if (ExternalCssResourceRegex().IsMatch(normalizedHtml))
        {
            issues.Add(new SignatureInspectionIssue(
                "external_css_resource",
                "签名样式引用了外部资源，APP 预览不会加载该资源，Outlook 中的显示也可能不一致。",
                "warning"));
        }

        return issues;
    }

    public static void EnsureCanUse(SignatureInspectionResult inspection)
    {
        var blocking = inspection.Issues.Where(issue => issue.Severity.Equals("blocking", StringComparison.OrdinalIgnoreCase)).ToList();
        if (blocking.Count == 0) return;
        throw new InvalidDataException(string.Join(" ", blocking.Select(issue => issue.Message)));
    }

    public static string CombineHtml(string messageHtml, string signatureHtml)
    {
        if (string.IsNullOrWhiteSpace(signatureHtml))
        {
            return $"<html><body>{messageHtml}</body></html>";
        }

        var bodyMatch = BodyOpenRegex().Match(signatureHtml);
        if (bodyMatch.Success)
        {
            return signatureHtml.Insert(bodyMatch.Index + bodyMatch.Length, $"<div>{messageHtml}</div><br>");
        }

        return $"<html><body>{messageHtml}<br>{signatureHtml}</body></html>";
    }

    private static void AddBlockingIssue(List<SignatureInspectionIssue> issues, bool condition, string code, string message)
    {
        if (condition) issues.Add(new SignatureInspectionIssue(code, message, "blocking"));
    }

    [GeneratedRegex(@"<\s*(?:script|iframe|frame|object|embed|form|input|button|textarea|select|meta|base|link)\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ForbiddenElementRegex();

    [GeneratedRegex(@"\son[a-z0-9_-]+\s*=", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex EventHandlerRegex();

    [GeneratedRegex("""(?:href|src|background)\s*=\s*['"]?\s*(?:javascript|vbscript|data\s*:\s*text/html)\s*:""", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex UnsafeUriRegex();

    [GeneratedRegex("""(?:expression\s*\(|behavior\s*:|-moz-binding\s*:|url\s*\(\s*['"]?\s*(?:javascript|vbscript)\s*:)""", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex UnsafeCssRegex();

    [GeneratedRegex("""<img\b[^>]*\bsrc\s*=\s*(?:(?:['"])(?<value>.*?)(?:['"])|(?<value>[^\s>]+))""", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ImageSourceRegex();

    [GeneratedRegex("""url\s*\(\s*['"]?\s*(?:https?:|file:|\\\\|[A-Za-z]:\\)""", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ExternalCssResourceRegex();

    [GeneratedRegex(@"<body\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex BodyOpenRegex();

    [GeneratedRegex(@"<style\b", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex StyleElementRegex();
}
