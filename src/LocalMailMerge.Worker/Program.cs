using System.Text.Json;
using System.Text.Json.Serialization;
using LocalMailMerge.Core;

namespace LocalMailMerge.App;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static async Task<int> Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.InputEncoding = System.Text.Encoding.UTF8;
        if (args.Length != 1)
        {
            Console.Error.WriteLine("用法：LocalMailMerge.Worker <capabilities|inspect-xlsx|import|accounts|inspect-template|test-signature|create-drafts>");
            return 2;
        }

        try
        {
            var input = await Console.In.ReadToEndAsync().ConfigureAwait(false);
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(input) ? "{}" : input);
            object output = args[0] switch
            {
                "capabilities" => Capabilities(),
                "inspect-xlsx" => await InspectXlsxAsync(document.RootElement).ConfigureAwait(false),
                "import" => await ImportAsync(document.RootElement).ConfigureAwait(false),
                "accounts" => await ListAccountsAsync().ConfigureAwait(false),
                "inspect-template" => await InspectTemplateAsync(document.RootElement).ConfigureAwait(false),
                "test-signature" => await CreateSignatureTestDraftAsync(document.RootElement).ConfigureAwait(false),
                "create-drafts" => await CreateDraftsAsync(document.RootElement).ConfigureAwait(false),
                _ => throw new InvalidOperationException("不支持的本地助手命令。")
            };
            await Console.Out.WriteAsync(JsonSerializer.Serialize(output, JsonOptions)).ConfigureAwait(false);
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(SanitizeError(exception));
            return 1;
        }
    }

    private static object Capabilities() => new
    {
        protocolVersion = 2,
        validationPolicyVersion = 1,
        supportsValidationIssues = true,
        supportsSignatureInspection = true,
        supportsSignatureTestDraft = true
    };

    private static async Task<object> InspectXlsxAsync(JsonElement input)
    {
        var path = RequiredString(input, "path");
        return await new PackageImporter().InspectXlsxAsync(path).ConfigureAwait(false);
    }

    private static async Task<object> ImportAsync(JsonElement input)
    {
        var path = RequiredString(input, "path");
        var batch = await LoadAndValidateAsync(path, ReadXlsxOptions(input), ReadValidationPolicy(input)).ConfigureAwait(false);
        return ToViewModel(batch);
    }

    private static async Task<object> ListAccountsAsync()
    {
        var accounts = await new OutlookDraftService().GetAccountsAsync().ConfigureAwait(false);
        return accounts.Select(account => new
        {
            account.Index,
            account.DisplayName,
            account.SmtpAddress,
            account.StoreId
        });
    }

    private static async Task<object> InspectTemplateAsync(JsonElement input)
    {
        var templatePath = RequiredString(input, "templatePath");
        return await new OutlookDraftService().InspectTemplateAsync(templatePath).ConfigureAwait(false);
    }

    private static async Task<object> CreateSignatureTestDraftAsync(JsonElement input)
    {
        var templatePath = RequiredString(input, "templatePath");
        var account = ReadAccount(input);
        return await new OutlookDraftService().CreateSignatureTestDraftAsync(account, templatePath).ConfigureAwait(false);
    }

    private static async Task<object> CreateDraftsAsync(JsonElement input)
    {
        var packagePath = RequiredString(input, "packagePath");
        var templatePath = RequiredString(input, "templatePath");
        var selectedIds = input.TryGetProperty("selectedPersonIds", out var idsElement) && idsElement.ValueKind == JsonValueKind.Array
            ? idsElement.EnumerateArray().Select(item => item.GetString() ?? string.Empty).Where(item => !string.IsNullOrWhiteSpace(item)).ToHashSet(StringComparer.OrdinalIgnoreCase)
            : throw new InvalidDataException("未提供所选人员。 ");
        if (selectedIds.Count == 0) throw new InvalidDataException("至少选择一条可创建记录。 ");

        var account = ReadAccount(input);

        var batch = await LoadAndValidateAsync(packagePath, ReadXlsxOptions(input), ReadValidationPolicy(input)).ConfigureAwait(false);
        var selected = batch.Messages.Where(message => selectedIds.Contains(message.PersonId)).ToList();
        var missing = selectedIds.Except(selected.Select(message => message.PersonId), StringComparer.OrdinalIgnoreCase).ToList();
        if (missing.Count > 0) throw new InvalidDataException("部分所选人员已不在交接包中，请重新导入后选择。 ");
        var blocked = selected.Where(message => !message.Validation.CanCreate).ToList();
        if (blocked.Count > 0) throw new InvalidDataException("所选记录中包含未通过最新校验的人员，未创建任何草稿。 ");

        var auditStore = new AuditStore();
        var results = await new OutlookDraftService().CreateDraftsAsync(
            selected,
            account,
            templatePath,
            auditStore).ConfigureAwait(false);
        var reportPath = string.Empty;
        var reportError = string.Empty;
        try
        {
            reportPath = await auditStore.WriteReportAsync(batch.BatchId, results).ConfigureAwait(false);
        }
        catch (Exception exception)
        {
            reportError = SanitizeError(exception);
        }
        return new
        {
            reportPath,
            reportError,
            summary = new
            {
                success = results.Count(result => result.Outcome == "Success"),
                skipped = results.Count(result => result.Outcome == "Skipped"),
                failed = results.Count(result => result.Outcome == "Failed")
            },
            results
        };
    }

    private static OutlookAccountInfo ReadAccount(JsonElement input)
    {
        if (!input.TryGetProperty("account", out var accountElement) || accountElement.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("未提供 Outlook 发件账户。 ");
        }

        return new OutlookAccountInfo(
            RequiredInt32(accountElement, "index"),
            RequiredString(accountElement, "displayName"),
            RequiredString(accountElement, "smtpAddress", allowEmpty: true),
            RequiredString(accountElement, "storeId"));
    }

    private static async Task<OutreachBatch> LoadAndValidateAsync(
        string path,
        XlsxImportOptions? xlsxOptions,
        ValidationPolicy validationPolicy)
    {
        var batch = await new PackageImporter().ImportAsync(path, xlsxOptions).ConfigureAwait(false);
        var auditStore = new AuditStore();
        new ValidationService().Validate(batch, auditStore.LoadSuccessfulKeys(), validationPolicy);
        return batch;
    }

    private static ValidationPolicy ReadValidationPolicy(JsonElement input)
    {
        if (!input.TryGetProperty("validationPolicy", out var policyElement) || policyElement.ValueKind != JsonValueKind.Object)
        {
            return ValidationPolicy.Default;
        }

        var rules = new Dictionary<string, ValidationRuleLevel>(StringComparer.OrdinalIgnoreCase);
        foreach (var property in policyElement.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.String) continue;
            var level = property.Value.GetString()?.ToLowerInvariant() switch
            {
                "blocking" => ValidationRuleLevel.Blocking,
                "warning" => ValidationRuleLevel.Warning,
                "pass" => ValidationRuleLevel.Pass,
                _ => (ValidationRuleLevel?)null
            };
            if (level is not null) rules[property.Name] = level.Value;
        }

        return new ValidationPolicy(rules);
    }

    private static XlsxImportOptions? ReadXlsxOptions(JsonElement input)
    {
        var hasWorksheet = input.TryGetProperty("worksheetName", out var worksheetElement) && worksheetElement.ValueKind == JsonValueKind.String;
        var headerRowNumber = 0;
        var hasHeaderRow = input.TryGetProperty("headerRowNumber", out var headerElement) && headerElement.TryGetInt32(out headerRowNumber);
        if (!hasWorksheet && !hasHeaderRow) return null;
        if (!hasWorksheet || !hasHeaderRow || headerRowNumber <= 0)
        {
            throw new InvalidDataException("Excel Sheet 或字段行参数无效。");
        }

        var worksheetName = worksheetElement.GetString();
        if (string.IsNullOrWhiteSpace(worksheetName)) throw new InvalidDataException("Excel Sheet 名称为空。");
        var emailColumnName = input.TryGetProperty("emailColumnName", out var emailElement) && emailElement.ValueKind == JsonValueKind.String
            ? emailElement.GetString()?.Trim() ?? string.Empty
            : string.Empty;
        if (emailColumnName.Length > 256) throw new InvalidDataException("Excel 邮箱字段名称过长。");
        return new XlsxImportOptions(worksheetName, headerRowNumber, emailColumnName);
    }

    private static object ToViewModel(OutreachBatch batch)
    {
        var fields = batch.Fields.Select(field => new
        {
            field.Key,
            label = field.Key == ValidationService.ValidationFieldKey ? field.DisplayName : field.Key,
            field.DefaultVisible,
            width = FieldWidth(field.DisplayName)
        }).ToList();
        var records = batch.Messages.Select((message, index) =>
        {
            var values = new Dictionary<string, string>(message.Fields, StringComparer.OrdinalIgnoreCase);
            foreach (var field in batch.Fields)
            {
                values[field.Key] = message.GetFieldValue(field.Key);
            }

            return new
            {
                id = $"{message.PersonId}:{index}",
                message.BatchId,
                message.PersonId,
                message.RecipientName,
                message.RecipientEmail,
                message.Subject,
                message.BodyHtml,
                message.BodyText,
                message.TargetRole,
                values,
                validationKind = ValidationKind(message.Validation.State),
                validationText = ValidationText(message),
                validationDetail = message.Validation.DetailText,
                validationIssues = message.Validation.Issues.Select(issue => new
                {
                    issue.Code,
                    issue.Message,
                    severity = issue.Severity == ValidationIssueSeverity.Blocking ? "blocking" : "warning"
                }),
                canCreate = message.Validation.CanCreate,
                initiallySelected = message.IsSelected
            };
        }).ToList();

        return new
        {
            batch.BatchId,
            sourcePath = batch.SourcePath,
            sourceWorksheetName = string.IsNullOrWhiteSpace(batch.SourceWorksheetName) ? null : batch.SourceWorksheetName,
            batch.HeaderRowNumber,
            sourceEmailColumnName = string.IsNullOrWhiteSpace(batch.SourceEmailColumnName) ? null : batch.SourceEmailColumnName,
            fields,
            records,
            aggregate = new
            {
                total = records.Count,
                creatable = batch.Messages.Count(message => message.Validation.CanCreate),
                eligible = batch.Messages.Count(message => message.Validation.State == ValidationState.Eligible),
                review = batch.Messages.Count(message => message.Validation.State == ValidationState.NeedsReview),
                blocked = batch.Messages.Count(message => !message.Validation.CanCreate),
                duplicate = batch.Messages.Count(message => message.Validation.State == ValidationState.Duplicate),
                visible = records.Count
            }
        };
    }

    private static string ValidationText(OutreachMessage message)
    {
        if (message.Validation.Issues.Any(issue => issue.Code == "invalid_email")) return "邮箱无效";
        if (message.Validation.Issues.Any(issue => issue.Code == "duplicate_person")) return "人员标识重复";
        if (message.Validation.Issues.Any(issue => issue.Code == "already_created")) return "重复创建";
        if (message.Validation.Issues.Any(issue => issue.Code == "content_hash_mismatch")) return "内容已变更";
        if (message.Validation.Issues.Any(issue => issue.Code == "unresolved_placeholder")) return "占位符残留";
        if (message.Validation.Issues.Any(issue => issue.Code is "missing_subject" or "missing_body")) return "内容待补充";
        if (message.Validation.Issues.Any(issue => issue.Code == "review_not_approved")) return "待人工确认";
        if (message.Validation.Issues.Any(issue => issue.Code == "duplicate_email")) return "邮箱重复";
        if (message.Validation.Issues.Any(issue => issue.Code == "missing_personalization_source")) return "缺少个性化事实";
        return message.Validation.State switch
        {
            ValidationState.Eligible => "通过",
            ValidationState.Duplicate => "重复",
            ValidationState.NeedsReview => "有警告",
            ValidationState.Blocked => "已拦截",
            _ => "未校验"
        };
    }

    private static string ValidationKind(ValidationState state) => state switch
    {
        ValidationState.Eligible => "eligible",
        ValidationState.NeedsReview => "review",
        ValidationState.Duplicate => "duplicate",
        _ => "blocked"
    };

    private static int FieldWidth(string displayName) => displayName switch
    {
        "姓名" => 168,
        "邮箱" => 172,
        "目标岗位" => 164,
        "机构" => 126,
        "国家/地区" => 118,
        "审核状态" => 112,
        "校验结果" => 126,
        "邮件主题" => 240,
        "邮件正文" => 280,
        _ => 160
    };

    private static string RequiredString(JsonElement input, string name, bool allowEmpty = false)
    {
        if (!input.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
        {
            throw new InvalidDataException($"缺少参数：{name}");
        }

        var result = value.GetString() ?? string.Empty;
        if (!allowEmpty && string.IsNullOrWhiteSpace(result)) throw new InvalidDataException($"参数为空：{name}");
        if (result.Length > 4096) throw new InvalidDataException($"参数过长：{name}");
        return result;
    }

    private static int RequiredInt32(JsonElement input, string name)
    {
        if (!input.TryGetProperty(name, out var value) || !value.TryGetInt32(out var result))
        {
            throw new InvalidDataException($"参数无效：{name}");
        }
        return result;
    }

    private static string SanitizeError(Exception exception)
    {
        var message = exception.GetBaseException().Message.ReplaceLineEndings(" ").Trim();
        return message.Length <= 500 ? message : message[..500];
    }
}
