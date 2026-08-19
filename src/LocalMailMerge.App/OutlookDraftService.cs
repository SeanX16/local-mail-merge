using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using LocalMailMerge.Core;

namespace LocalMailMerge.App;

internal sealed record OutlookAccountInfo(int Index, string DisplayName, string SmtpAddress, string StoreId)
{
    public override string ToString() => string.IsNullOrWhiteSpace(SmtpAddress)
        ? DisplayName
        : $"{DisplayName}  <{SmtpAddress}>";
}

internal sealed record SignatureTestDraftResult(string OutlookEntryId, SignatureInspectionResult Inspection);

internal sealed partial class OutlookDraftService
{
    private const int OutlookDraftsFolder = 16;
    private const long MaximumTemplateBytes = 20 * 1024 * 1024;

    public Task<IReadOnlyList<OutlookAccountInfo>> GetAccountsAsync() => RunStaAsync(GetAccounts);

    public Task<SignatureInspectionResult> InspectTemplateAsync(string templatePath) =>
        RunStaAsync(() => InspectTemplate(templatePath));

    public Task<SignatureTestDraftResult> CreateSignatureTestDraftAsync(
        OutlookAccountInfo selectedAccount,
        string templatePath) =>
        RunStaAsync(() => CreateSignatureTestDraft(selectedAccount, templatePath));

    public Task<IReadOnlyList<DraftCreationResult>> CreateDraftsAsync(
        IReadOnlyList<OutreachMessage> messages,
        OutlookAccountInfo selectedAccount,
        string templatePath,
        AuditStore auditStore,
        IProgress<(int Completed, int Total)>? progress = null,
        CancellationToken cancellationToken = default) =>
        RunStaAsync(() => CreateDrafts(messages, selectedAccount, templatePath, auditStore, progress, cancellationToken));

    private static IReadOnlyList<OutlookAccountInfo> GetAccounts()
    {
        object? application = null;
        object? session = null;
        object? accounts = null;
        var result = new List<OutlookAccountInfo>();
        try
        {
            application = CreateOutlookApplication();
            session = GetProperty(application, "Session");
            accounts = GetProperty(session, "Accounts");
            var count = Convert.ToInt32(GetProperty(accounts, "Count"), System.Globalization.CultureInfo.InvariantCulture);
            for (var index = 1; index <= count; index++)
            {
                object? account = null;
                object? store = null;
                try
                {
                    account = InvokeMember(accounts, "Item", index);
                    var displayName = Convert.ToString(GetProperty(account, "DisplayName"), System.Globalization.CultureInfo.InvariantCulture) ?? $"Outlook 账户 {index}";
                    var smtp = Convert.ToString(GetProperty(account, "SmtpAddress"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
                    store = GetProperty(account, "DeliveryStore");
                    var storeId = Convert.ToString(GetProperty(store, "StoreID"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
                    result.Add(new OutlookAccountInfo(index, displayName, smtp, storeId));
                }
                finally
                {
                    ReleaseCom(store);
                    ReleaseCom(account);
                }
            }

            return result;
        }
        finally
        {
            ReleaseCom(accounts);
            ReleaseCom(session);
            ReleaseCom(application);
        }
    }

    private static IReadOnlyList<DraftCreationResult> CreateDrafts(
        IReadOnlyList<OutreachMessage> messages,
        OutlookAccountInfo selectedAccount,
        string templatePath,
        AuditStore auditStore,
        IProgress<(int Completed, int Total)>? progress,
        CancellationToken cancellationToken)
    {
        var inspection = InspectTemplate(templatePath);
        SignatureTemplateInspector.EnsureCanUse(inspection);
        var templateExtension = Path.GetExtension(templatePath).ToLowerInvariant();

        object? application = null;
        object? session = null;
        object? accounts = null;
        object? account = null;
        object? store = null;
        object? draftsFolder = null;
        object? draftsItems = null;
        var results = new List<DraftCreationResult>();
        var signatureHtml = templateExtension is ".html" or ".htm" ? File.ReadAllText(templatePath) : string.Empty;

        try
        {
            application = CreateOutlookApplication();
            session = GetProperty(application, "Session");
            accounts = GetProperty(session, "Accounts");
            account = InvokeMember(accounts, "Item", selectedAccount.Index);
            store = GetProperty(account, "DeliveryStore");
            var actualStoreId = Convert.ToString(GetProperty(store, "StoreID"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
            if (!actualStoreId.Equals(selectedAccount.StoreId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Outlook 账户列表已变化，请重新选择发件账户。 ");
            }

            draftsFolder = InvokeMember(store, "GetDefaultFolder", OutlookDraftsFolder);
            draftsItems = GetProperty(draftsFolder, "Items");

            for (var index = 0; index < messages.Count; index++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var message = messages[index];
                object? mail = null;
                try
                {
                    mail = templateExtension == ".oft"
                        ? InvokeMember(application, "CreateItemFromTemplate", templatePath, draftsFolder)
                        : InvokeMember(draftsItems, "Add", "IPM.Note");

                    SetProperty(mail, "SendUsingAccount", account);
                    SetProperty(mail, "To", message.RecipientEmail);
                    SetProperty(mail, "CC", string.Empty);
                    SetProperty(mail, "BCC", string.Empty);
                    SetProperty(mail, "Subject", message.Subject);
                    SetProperty(mail, "BodyFormat", 2);

                    var existingTemplateBody = templateExtension == ".oft"
                        ? Convert.ToString(GetProperty(mail, "HTMLBody"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty
                        : signatureHtml;
                    SetProperty(mail, "HTMLBody", SignatureTemplateInspector.CombineHtml(message.EffectiveBodyHtml, existingTemplateBody));
                    InvokeMember(mail, "Save");
                    var entryId = Convert.ToString(GetProperty(mail, "EntryID"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;

                    var result = new DraftCreationResult(message.PersonId, "Success", entryId, string.Empty, string.Empty);
                    results.Add(result);
                    auditStore.AppendAsync(new AuditEntry(
                        message.BatchId,
                        message.PersonId,
                        message.ComputedContentHash,
                        entryId,
                        DateTimeOffset.Now,
                        "Success",
                        string.Empty,
                        string.Empty), cancellationToken).GetAwaiter().GetResult();
                }
                catch (Exception exception)
                {
                    var error = SanitizeError(exception);
                    var result = new DraftCreationResult(message.PersonId, "Failed", string.Empty, exception.GetType().Name, error);
                    results.Add(result);
                    auditStore.AppendAsync(new AuditEntry(
                        message.BatchId,
                        message.PersonId,
                        message.ComputedContentHash,
                        string.Empty,
                        DateTimeOffset.Now,
                        "Failed",
                        exception.GetType().Name,
                        error), cancellationToken).GetAwaiter().GetResult();
                }
                finally
                {
                    ReleaseCom(mail);
                    progress?.Report((index + 1, messages.Count));
                }
            }

            return results;
        }
        finally
        {
            ReleaseCom(draftsItems);
            ReleaseCom(draftsFolder);
            ReleaseCom(store);
            ReleaseCom(account);
            ReleaseCom(accounts);
            ReleaseCom(session);
            ReleaseCom(application);
        }
    }

    private static SignatureInspectionResult InspectTemplate(string templatePath)
    {
        var templateExtension = ValidateTemplatePath(templatePath);
        if (templateExtension is ".html" or ".htm")
        {
            return SignatureTemplateInspector.InspectHtmlFile(templatePath);
        }

        object? application = null;
        object? mail = null;
        object? attachments = null;
        var inlineAttachments = new List<string>();
        var regularAttachments = new List<string>();
        try
        {
            application = CreateOutlookApplication();
            mail = InvokeMember(application, "CreateItemFromTemplate", templatePath);
            attachments = GetProperty(mail, "Attachments");
            var attachmentCount = Convert.ToInt32(GetProperty(attachments, "Count"), System.Globalization.CultureInfo.InvariantCulture);
            for (var index = 1; index <= attachmentCount; index++)
            {
                object? attachment = null;
                object? propertyAccessor = null;
                try
                {
                    attachment = InvokeMember(attachments, "Item", index);
                    var fileName = Convert.ToString(GetProperty(attachment, "FileName"), System.Globalization.CultureInfo.InvariantCulture) ?? $"附件 {index}";
                    propertyAccessor = GetProperty(attachment, "PropertyAccessor");
                    var contentId = TryGetMapiString(propertyAccessor, "http://schemas.microsoft.com/mapi/proptag/0x3712001F");
                    var hidden = TryGetMapiBoolean(propertyAccessor, "http://schemas.microsoft.com/mapi/proptag/0x7FFE000B");
                    var mimeType = TryGetMapiString(propertyAccessor, "http://schemas.microsoft.com/mapi/proptag/0x370E001F");
                    if (IsInlineImage(fileName, mimeType, contentId, hidden)) inlineAttachments.Add(fileName);
                    else regularAttachments.Add(fileName);
                }
                finally
                {
                    ReleaseCom(propertyAccessor);
                    ReleaseCom(attachment);
                }
            }

            var html = Convert.ToString(GetProperty(mail, "HTMLBody"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
            return SignatureTemplateInspector.FromHtml(
                "oft",
                html,
                previewComplete: inlineAttachments.Count == 0,
                subject: StringProperty(mail, "Subject"),
                to: StringProperty(mail, "To"),
                cc: StringProperty(mail, "CC"),
                bcc: StringProperty(mail, "BCC"),
                inlineAttachments: inlineAttachments,
                regularAttachments: regularAttachments);
        }
        finally
        {
            if (mail is not null)
            {
                try { InvokeMember(mail, "Close", 1); } catch { }
            }
            ReleaseCom(attachments);
            ReleaseCom(mail);
            ReleaseCom(application);
        }
    }

    private static SignatureTestDraftResult CreateSignatureTestDraft(OutlookAccountInfo selectedAccount, string templatePath)
    {
        var inspection = InspectTemplate(templatePath);
        SignatureTemplateInspector.EnsureCanUse(inspection);
        var templateExtension = Path.GetExtension(templatePath).ToLowerInvariant();

        object? application = null;
        object? session = null;
        object? accounts = null;
        object? account = null;
        object? store = null;
        object? draftsFolder = null;
        object? draftsItems = null;
        object? mail = null;
        try
        {
            application = CreateOutlookApplication();
            session = GetProperty(application, "Session");
            accounts = GetProperty(session, "Accounts");
            account = InvokeMember(accounts, "Item", selectedAccount.Index);
            store = GetProperty(account, "DeliveryStore");
            var actualStoreId = Convert.ToString(GetProperty(store, "StoreID"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
            if (!actualStoreId.Equals(selectedAccount.StoreId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Outlook 账户列表已变化，请重新选择发件账户。 ");
            }

            draftsFolder = InvokeMember(store, "GetDefaultFolder", OutlookDraftsFolder);
            draftsItems = GetProperty(draftsFolder, "Items");
            mail = templateExtension == ".oft"
                ? InvokeMember(application, "CreateItemFromTemplate", templatePath, draftsFolder)
                : InvokeMember(draftsItems, "Add", "IPM.Note");

            SetProperty(mail, "SendUsingAccount", account);
            SetProperty(mail, "To", string.Empty);
            SetProperty(mail, "CC", string.Empty);
            SetProperty(mail, "BCC", string.Empty);
            SetProperty(mail, "Subject", "[Local Mail Merge] 邮件签名测试");
            SetProperty(mail, "BodyFormat", 2);
            var signatureHtml = templateExtension == ".oft"
                ? Convert.ToString(GetProperty(mail, "HTMLBody"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty
                : File.ReadAllText(templatePath);
            const string testBody = "<div style=\"font-family:'Microsoft YaHei UI','Segoe UI',sans-serif\"><p><strong>Local Mail Merge 邮件签名测试</strong></p><p>这是一封没有收件人的本地测试草稿。请检查下方签名的文字、Logo、链接和排版；确认后删除本草稿，不要发送。</p></div>";
            SetProperty(mail, "HTMLBody", SignatureTemplateInspector.CombineHtml(testBody, signatureHtml));
            InvokeMember(mail, "Save");
            var entryId = Convert.ToString(GetProperty(mail, "EntryID"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
            return new SignatureTestDraftResult(entryId, inspection);
        }
        finally
        {
            ReleaseCom(mail);
            ReleaseCom(draftsItems);
            ReleaseCom(draftsFolder);
            ReleaseCom(store);
            ReleaseCom(account);
            ReleaseCom(accounts);
            ReleaseCom(session);
            ReleaseCom(application);
        }
    }

    private static string ValidateTemplatePath(string templatePath)
    {
        if (!File.Exists(templatePath)) throw new FileNotFoundException("邮件签名文件不存在。", templatePath);
        var file = new FileInfo(templatePath);
        if (file.Length == 0) throw new InvalidDataException("邮件签名文件为空。 ");
        if (file.Length > MaximumTemplateBytes) throw new InvalidDataException("邮件签名文件不能超过 20 MB。 ");
        var extension = Path.GetExtension(templatePath).ToLowerInvariant();
        if (extension is not ".oft" and not ".html" and not ".htm")
        {
            throw new InvalidDataException("邮件签名仅支持 .oft、.html 或 .htm。 ");
        }
        return extension;
    }

    private static string StringProperty(object target, string name) =>
        Convert.ToString(GetProperty(target, name), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;

    private static string TryGetMapiString(object propertyAccessor, string schemaName)
    {
        try { return Convert.ToString(InvokeMember(propertyAccessor, "GetProperty", schemaName), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty; }
        catch { return string.Empty; }
    }

    private static bool TryGetMapiBoolean(object propertyAccessor, string schemaName)
    {
        try { return Convert.ToBoolean(InvokeMember(propertyAccessor, "GetProperty", schemaName), System.Globalization.CultureInfo.InvariantCulture); }
        catch { return false; }
    }

    private static bool IsInlineImage(string fileName, string mimeType, string contentId, bool hidden)
    {
        if (string.IsNullOrWhiteSpace(contentId) && !hidden) return false;
        if (mimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)) return true;
        return Path.GetExtension(fileName).ToLowerInvariant() is
            ".bmp" or ".dib" or ".emf" or ".gif" or ".jpeg" or ".jpg" or ".png" or
            ".svg" or ".tif" or ".tiff" or ".webp" or ".wmf";
    }

    private static object CreateOutlookApplication()
    {
        var type = Type.GetTypeFromProgID("Outlook.Application", throwOnError: false)
            ?? throw new InvalidOperationException("未检测到经典 Outlook。 ");
        return Activator.CreateInstance(type)
            ?? throw new InvalidOperationException("无法启动经典 Outlook。 ");
    }

    private static string SanitizeError(Exception exception)
    {
        var message = EmailRegex().Replace(exception.Message, "[redacted-email]");
        return message.Length <= 300 ? message : message[..300];
    }

    private static object GetProperty(object target, string name) =>
        target.GetType().InvokeMember(name, System.Reflection.BindingFlags.GetProperty, null, target, null)
        ?? throw new InvalidOperationException($"Outlook 属性不可用：{name}");

    private static void SetProperty(object target, string name, object? value) =>
        target.GetType().InvokeMember(name, System.Reflection.BindingFlags.SetProperty, null, target, [value]);

    private static object InvokeMember(object target, string name, params object?[] arguments) =>
        target.GetType().InvokeMember(name, System.Reflection.BindingFlags.InvokeMethod, null, target, arguments)
        ?? throw new InvalidOperationException($"Outlook 操作失败：{name}");

    private static void ReleaseCom(object? value)
    {
        if (value is not null && Marshal.IsComObject(value))
        {
            Marshal.FinalReleaseComObject(value);
        }
    }

    private static Task<T> RunStaAsync<T>(Func<T> action)
    {
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try
            {
                completion.SetResult(action());
            }
            catch (Exception exception)
            {
                completion.SetException(exception);
            }
        })
        {
            IsBackground = true,
            Name = "LocalMailMerge.OutlookSTA"
        };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return completion.Task;
    }

    [GeneratedRegex(@"[^\s@]+@[^\s@]+", RegexOptions.CultureInvariant)]
    private static partial Regex EmailRegex();
}
