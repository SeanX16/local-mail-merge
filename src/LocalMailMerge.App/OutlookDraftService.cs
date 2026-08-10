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

internal sealed partial class OutlookDraftService
{
    private const int OutlookDraftsFolder = 16;

    public Task<IReadOnlyList<OutlookAccountInfo>> GetAccountsAsync() => RunStaAsync(GetAccounts);

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
        if (!File.Exists(templatePath))
        {
            throw new FileNotFoundException("公司签名或模板文件不存在。", templatePath);
        }

        var templateExtension = Path.GetExtension(templatePath).ToLowerInvariant();
        if (templateExtension is not ".oft" and not ".html" and not ".htm")
        {
            throw new InvalidDataException("公司模板仅支持 .oft、.html 或 .htm。 ");
        }

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
                    SetProperty(mail, "Subject", message.Subject);
                    SetProperty(mail, "BodyFormat", 2);

                    var existingTemplateBody = templateExtension == ".oft"
                        ? Convert.ToString(GetProperty(mail, "HTMLBody"), System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty
                        : signatureHtml;
                    SetProperty(mail, "HTMLBody", CombineHtml(message.EffectiveBodyHtml, existingTemplateBody));
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

    private static object CreateOutlookApplication()
    {
        var type = Type.GetTypeFromProgID("Outlook.Application", throwOnError: false)
            ?? throw new InvalidOperationException("未检测到经典 Outlook。 ");
        return Activator.CreateInstance(type)
            ?? throw new InvalidOperationException("无法启动经典 Outlook。 ");
    }

    private static string CombineHtml(string messageHtml, string templateHtml)
    {
        if (string.IsNullOrWhiteSpace(templateHtml))
        {
            return $"<html><body>{messageHtml}</body></html>";
        }

        var bodyMatch = BodyOpenRegex().Match(templateHtml);
        if (bodyMatch.Success)
        {
            return templateHtml.Insert(bodyMatch.Index + bodyMatch.Length, $"<div>{messageHtml}</div><br>");
        }

        return $"<html><body>{messageHtml}<br>{templateHtml}</body></html>";
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

    [GeneratedRegex(@"<body\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex BodyOpenRegex();

    [GeneratedRegex(@"[^\s@]+@[^\s@]+", RegexOptions.CultureInvariant)]
    private static partial Regex EmailRegex();
}
