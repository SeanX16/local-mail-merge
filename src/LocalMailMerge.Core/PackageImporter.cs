using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace LocalMailMerge.Core;

public sealed class PackageImporter
{
    private static readonly string[] PersonIdAliases = ["person_id", "personid", "record_id", "recordid", "candidate_id", "candidateid", "人员id", "候选人id", "记录id"];
    private static readonly string[] NameAliases = ["recipient_name", "name", "full_name", "fullname", "candidate_name", "candidatename", "contact_name", "contactname", "姓名", "候选人姓名", "联系人姓名"];
    private static readonly string[] EmailAliases = ["recipient_email", "email", "e-mail", "email_address", "emailaddress", "e-mail_address", "email_id", "emailid", "邮箱", "邮箱地址", "邮件地址", "电子邮箱", "电子邮件", "电子邮件地址", "联系邮箱", "工作邮箱"];
    private static readonly string[] EmailHeaderKeywords = ["email", "邮箱", "电子邮件", "电邮"];
    private static readonly string[] EmailHeaderNegativeKeywords = ["status", "state", "valid", "validity", "verified", "verification", "reason", "type", "domain", "optout", "unsubscribe", "consent", "bounce", "bounced", "是否", "状态", "有效", "验证", "原因", "类型", "域名", "退订", "拒收", "许可", "同意", "标记"];
    private static readonly Regex EmailValueRegex = new(@"^[^\s@]+@[^\s@]+\.[^\s@]+$", RegexOptions.CultureInvariant);
    private static readonly string[] SubjectAliases = ["subject", "email_subject", "emailsubject", "邮件主题", "主题"];
    private static readonly string[] BodyHtmlAliases = ["body_html", "htmlbody", "email_body_html", "emailbodyhtml", "邮件正文html", "正文html"];
    private static readonly string[] BodyTextAliases = ["body_text", "body", "email_body", "emailbody", "message", "邮件正文", "正文"];
    private static readonly string[] RoleAliases = ["target_role", "targetrole", "job_category", "jobcategory", "original_job_title", "originaljobtitle", "job_title", "jobtitle", "position", "role", "title", "目标岗位", "岗位", "职位", "职称", "岗位名称"];
    private static readonly string[] ReviewAliases = ["review_status", "reviewstatus", "approval_status", "approvalstatus", "审核状态", "审批状态", "审核"];
    private static readonly string[] DoNotContactAliases = ["do_not_contact", "donotcontact", "禁止联系"];
    private static readonly string[] ContentHashAliases = ["content_hash", "contenthash", "内容哈希"];
    private static readonly string[] FactsAliases = ["personalization_facts", "personalizationfacts", "个性化事实"];
    private static readonly string[] OrganizationAliases = ["organization", "organisation", "organization_name", "organisation_name", "company", "company_name", "institution", "affiliation", "employer", "school", "university", "机构", "机构名称", "单位", "公司", "学校", "院校"];
    private static readonly string[] SourceUrlAliases = ["primary_source_url", "primarysourceurl", "source_url", "sourceurl", "profile_url", "profileurl", "来源url", "来源链接"];

    public Task<OutreachBatch> ImportAsync(string path, CancellationToken cancellationToken = default) =>
        ImportAsync(path, null, cancellationToken);

    public async Task<OutreachBatch> ImportAsync(
        string path,
        XlsxImportOptions? xlsxOptions,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var extension = Path.GetExtension(path).ToLowerInvariant();
        return extension switch
        {
            ".json" => await ImportJsonAsync(path, cancellationToken).ConfigureAwait(false),
            ".csv" => await ImportCsvAsync(path, cancellationToken).ConfigureAwait(false),
            ".xlsx" => await Task.Run(() => ImportXlsx(path, xlsxOptions), cancellationToken).ConfigureAwait(false),
            _ => throw new NotSupportedException("仅支持 .json、.csv 和 .xlsx 文件。")
        };
    }

    public Task<XlsxWorkbookInspection> InspectXlsxAsync(string path, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        if (!Path.GetExtension(path).Equals(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            throw new NotSupportedException("工作表选择仅适用于 .xlsx 文件。");
        }

        return Task.Run(() => InspectXlsx(path), cancellationToken);
    }

    private static async Task<OutreachBatch> ImportJsonAsync(string path, CancellationToken cancellationToken)
    {
        await using var stream = File.OpenRead(path);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var root = document.RootElement;
        var schemaVersion = "generic-json/v1";
        var batchId = Path.GetFileNameWithoutExtension(path);
        JsonElement messagesElement;

        if (root.ValueKind == JsonValueKind.Object &&
            TryGetProperty(root, "messages", out messagesElement) &&
            messagesElement.ValueKind == JsonValueKind.Array)
        {
            schemaVersion = GetString(root, "schema_version") is { Length: > 0 } schema ? schema : "outreach-package/v1";
            batchId = GetString(root, "batch_id") is { Length: > 0 } batch ? batch : batchId;
        }
        else if (root.ValueKind == JsonValueKind.Array)
        {
            messagesElement = root;
        }
        else if (root.ValueKind == JsonValueKind.Object)
        {
            var arrayProperty = root.EnumerateObject().FirstOrDefault(property => property.Value.ValueKind == JsonValueKind.Array);
            if (arrayProperty.Value.ValueKind != JsonValueKind.Array)
            {
                throw new InvalidDataException("JSON 中没有可导入的记录数组。");
            }

            messagesElement = arrayProperty.Value;
        }
        else
        {
            throw new InvalidDataException("JSON 根节点必须是对象或数组。");
        }

        var records = messagesElement.EnumerateArray()
            .Where(element => element.ValueKind == JsonValueKind.Object)
            .Select(element => element.EnumerateObject().ToDictionary(
                property => property.Name,
                property => JsonValueToString(property.Value),
                StringComparer.OrdinalIgnoreCase))
            .ToList();

        var factsByRecord = messagesElement.EnumerateArray()
            .Where(element => element.ValueKind == JsonValueKind.Object)
            .Select(ReadFacts)
            .ToList();

        return BuildBatch(path, schemaVersion, batchId, records, factsByRecord);
    }

    private static async Task<OutreachBatch> ImportCsvAsync(string path, CancellationToken cancellationToken)
    {
        var text = await File.ReadAllTextAsync(path, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
        var rows = ParseCsv(text);
        if (rows.Count == 0)
        {
            throw new InvalidDataException("CSV 文件为空。");
        }

        var headers = MakeUniqueHeaders(rows[0]);
        var records = rows.Skip(1)
            .Where(row => row.Any(value => !string.IsNullOrWhiteSpace(value)))
            .Select(row => headers.Select((header, index) => new { header, value = index < row.Count ? row[index] : string.Empty })
                .ToDictionary(item => item.header, item => item.value, StringComparer.OrdinalIgnoreCase))
            .ToList();

        return BuildBatch(path, "generic-csv/v1", Path.GetFileNameWithoutExtension(path), records, null);
    }

    private static OutreachBatch ImportXlsx(string path, XlsxImportOptions? options)
    {
        using var archive = ZipFile.OpenRead(path);
        var sharedStrings = ReadSharedStrings(archive);
        var candidates = ReadWorksheetCandidates(archive, sharedStrings);

        if (candidates.Count == 0)
        {
            throw new InvalidDataException("Excel 中没有可导入的数据表。");
        }

        var selected = options is null
            ? candidates.OrderByDescending(candidate => candidate.Score).ThenBy(candidate => candidate.WorkbookIndex).First()
            : candidates.FirstOrDefault(candidate => candidate.Name.Equals(options.WorksheetName, StringComparison.OrdinalIgnoreCase))
                ?? throw new InvalidDataException($"Excel 中找不到工作表：{options.WorksheetName}");
        var headerRowNumber = options?.HeaderRowNumber ?? selected.HeaderRowNumber;
        var headerRow = selected.Rows.FirstOrDefault(row => row.RowNumber == headerRowNumber);
        if (headerRow is null || !headerRow.Cells.Values.Any(value => !string.IsNullOrWhiteSpace(value)))
        {
            throw new InvalidDataException("所选字段行不存在或为空，请重新选择。");
        }

        var dataRows = selected.Rows.Where(row => row.RowNumber > headerRowNumber).ToList();
        var maxColumn = selected.Rows.Where(row => row.RowNumber >= headerRowNumber)
            .Max(row => row.Cells.Count == 0 ? 0 : row.Cells.Keys.Max());
        var rawHeaders = Enumerable.Range(0, maxColumn + 1)
            .Select(index => headerRow.Cells.TryGetValue(index, out var value) ? value : $"Column {index + 1}")
            .ToList();
        var headers = MakeUniqueHeaders(rawHeaders);
        var emailColumnName = options?.EmailColumnName?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(emailColumnName) && !headers.Contains(emailColumnName, StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidDataException($"所选邮箱字段不存在：{emailColumnName}");
        }

        var records = dataRows
            .Where(row => row.Cells.Values.Any(value => !string.IsNullOrWhiteSpace(value)))
            .Select(row => headers.Select((header, index) => new
                {
                    header,
                    value = row.Cells.TryGetValue(index, out var cellValue) ? cellValue : string.Empty
                })
                .ToDictionary(item => item.header, item => item.value, StringComparer.OrdinalIgnoreCase))
            .ToList();

        return BuildBatch(
            path,
            "generic-xlsx/v1",
            Path.GetFileNameWithoutExtension(path),
            records,
            null,
            selected.Name,
            headerRowNumber,
            emailColumnName);
    }

    private static XlsxWorkbookInspection InspectXlsx(string path)
    {
        using var archive = ZipFile.OpenRead(path);
        var sharedStrings = ReadSharedStrings(archive);
        var candidates = ReadWorksheetCandidates(archive, sharedStrings);
        if (candidates.Count == 0)
        {
            throw new InvalidDataException("Excel 中没有可导入的数据表。");
        }

        var recommended = candidates
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.WorkbookIndex)
            .First();
        var sheets = candidates.OrderBy(candidate => candidate.WorkbookIndex).Select(candidate =>
        {
            var columnCount = candidate.Rows.Max(row => row.Cells.Count == 0 ? 0 : row.Cells.Keys.Max() + 1);
            var previewRows = candidate.Rows.Take(50)
                .Select(row => new XlsxPreviewRow(
                    row.RowNumber,
                    Enumerable.Range(0, columnCount)
                        .Select(index => row.Cells.TryGetValue(index, out var value) ? value : string.Empty)
                        .ToList()))
                .ToList();
            var dataRowCount = candidate.Rows.Where(row => row.RowNumber > candidate.HeaderRowNumber)
                .Count(row => row.Cells.Values.Any(value => !string.IsNullOrWhiteSpace(value)));
            return new XlsxSheetInspection(
                candidate.Name,
                candidate.WorkbookIndex,
                candidate.Rows.Max(row => row.RowNumber),
                columnCount,
                candidate.HeaderRowNumber,
                dataRowCount,
                previewRows);
        }).ToList();
        return new XlsxWorkbookInspection(recommended.Name, sheets);
    }

    private static List<WorksheetCandidate> ReadWorksheetCandidates(
        ZipArchive archive,
        IReadOnlyList<string> sharedStrings) =>
        ResolveWorksheets(archive)
            .Select((worksheet, index) => CreateWorksheetCandidate(archive, worksheet, index, sharedStrings))
            .Where(candidate => candidate is not null)
            .Cast<WorksheetCandidate>()
            .ToList();

    private static WorksheetCandidate? CreateWorksheetCandidate(
        ZipArchive archive,
        WorksheetReference worksheet,
        int workbookIndex,
        IReadOnlyList<string> sharedStrings)
    {
        var sheetEntry = archive.GetEntry(worksheet.Path);
        if (sheetEntry is null) return null;

        using var stream = sheetEntry.Open();
        var document = XDocument.Load(stream);
        XNamespace spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var rows = document.Descendants(spreadsheet + "row")
            .Select((row, index) => ReadXlsxRow(row, spreadsheet, sharedStrings, index + 1))
            .ToList();
        if (rows.Count == 0) return null;

        var bestHeaderRowNumber = rows[0].RowNumber;
        var bestScore = int.MinValue;
        var headerSearchLimit = Math.Min(rows.Count, 20);
        for (var headerIndex = 0; headerIndex < headerSearchLimit; headerIndex++)
        {
            var headerValues = rows[headerIndex].Cells.Values
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value.Trim())
                .ToList();
            if (headerValues.Count == 0) continue;

            var nameMatch = HeaderMatches(headerValues, NameAliases);
            var headerRow = rows[headerIndex];
            var emailColumns = ScoreEmailColumns(headerRow.Cells.OrderBy(cell => cell.Key).Select(cell => (
                Header: cell.Value,
                Values: rows.Where(row => row.RowNumber > headerRow.RowNumber)
                    .Select(row => row.Cells.TryGetValue(cell.Key, out var value) ? value : string.Empty))));
            var emailMatch = emailColumns.Any(candidate => candidate.Eligible);
            var identityMatches = CountHeaderMatches(headerValues, PersonIdAliases, NameAliases) + (emailMatch ? 1 : 0);
            var supportMatches = CountHeaderMatches(headerValues, RoleAliases, OrganizationAliases, SourceUrlAliases);
            var dataRowCount = rows.Where(row => row.RowNumber > rows[headerIndex].RowNumber)
                .Count(row => row.Cells.Values.Any(value => !string.IsNullOrWhiteSpace(value)));
            var score = (nameMatch ? 10_000_000 : 0)
                + (emailMatch ? 10_000_000 : 0)
                + identityMatches * 1_000_000
                + supportMatches * 100_000
                + Math.Min(headerValues.Count, 99) * 1_000
                + Math.Min(dataRowCount, 999)
                - rows[headerIndex].RowNumber;
            if (score <= bestScore) continue;
            bestScore = score;
            bestHeaderRowNumber = rows[headerIndex].RowNumber;
        }

        return new WorksheetCandidate(worksheet.Name, worksheet.Path, workbookIndex, rows, bestHeaderRowNumber, bestScore);
    }

    private static bool HeaderMatches(IReadOnlyList<string> headers, IEnumerable<string> aliases) =>
        headers.Any(header => aliases.Any(alias => NormalizeKey(alias) == NormalizeKey(header)));

    private static int CountHeaderMatches(IReadOnlyList<string> headers, params IEnumerable<string>[] aliasGroups) =>
        aliasGroups.Count(aliases => HeaderMatches(headers, aliases));

    private static OutreachBatch BuildBatch(
        string path,
        string schemaVersion,
        string batchId,
        IReadOnlyList<Dictionary<string, string>> records,
        IReadOnlyList<IReadOnlyList<PersonalizationFact>>? factsByRecord,
        string sourceWorksheetName = "",
        int? headerRowNumber = null,
        string emailColumnName = "")
    {
        var fieldOrder = new List<string>();
        foreach (var record in records)
        {
            foreach (var key in record.Keys)
            {
                if (!fieldOrder.Contains(key, StringComparer.OrdinalIgnoreCase))
                {
                    fieldOrder.Add(key);
                }
            }
        }

        var resolvedEmailColumnName = string.IsNullOrWhiteSpace(emailColumnName)
            ? FindLikelyEmailColumn(fieldOrder.Select((header, index) => (
                Header: header,
                Values: records.Select(record => record.TryGetValue(header, out var value) ? value : string.Empty))))
            : emailColumnName;

        var fields = fieldOrder
            .Select(key => new ImportField(key, GetDisplayName(key), IsDefaultVisible(key)))
            .Append(new ImportField(ValidationService.ValidationFieldKey, "校验结果", true))
            .ToList();

        var messages = records.Select((record, index) =>
        {
            var personId = GetAlias(record, PersonIdAliases);
            if (string.IsNullOrWhiteSpace(personId))
            {
                personId = $"row_{(index + 2).ToString(CultureInfo.InvariantCulture)}";
            }

            var facts = factsByRecord is not null && index < factsByRecord.Count
                ? factsByRecord[index]
                : ReadFactsFromString(GetAlias(record, FactsAliases));

            return new OutreachMessage
            {
                BatchId = batchId,
                PersonId = personId,
                RecipientName = GetAlias(record, NameAliases),
                RecipientEmail = GetMappedValueOrAlias(record, resolvedEmailColumnName, EmailAliases),
                Subject = GetAlias(record, SubjectAliases),
                BodyHtml = GetAlias(record, BodyHtmlAliases),
                BodyText = GetAlias(record, BodyTextAliases),
                TargetRole = GetAlias(record, RoleAliases),
                ReviewStatus = GetAlias(record, ReviewAliases),
                DoNotContact = ParseBoolean(GetAlias(record, DoNotContactAliases)),
                DeclaredContentHash = GetAlias(record, ContentHashAliases),
                PersonalizationFacts = facts,
                Fields = new Dictionary<string, string>(record, StringComparer.OrdinalIgnoreCase)
            };
        }).ToList();

        return new OutreachBatch
        {
            SchemaVersion = schemaVersion,
            BatchId = batchId,
            SourcePath = path,
            Fields = fields,
            Messages = messages,
            SourceWorksheetName = sourceWorksheetName,
            HeaderRowNumber = headerRowNumber,
            SourceEmailColumnName = resolvedEmailColumnName
        };
    }

    private static IReadOnlyList<PersonalizationFact> ReadFacts(JsonElement record)
    {
        if (!TryGetProperty(record, "personalization_facts", out var facts) || facts.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return facts.EnumerateArray()
            .Where(fact => fact.ValueKind == JsonValueKind.Object)
            .Select(fact => new PersonalizationFact(GetString(fact, "text"), GetString(fact, "source_url")))
            .ToList();
    }

    private static IReadOnlyList<PersonalizationFact> ReadFactsFromString(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        try
        {
            using var document = JsonDocument.Parse(value);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            return document.RootElement.EnumerateArray()
                .Where(fact => fact.ValueKind == JsonValueKind.Object)
                .Select(fact => new PersonalizationFact(GetString(fact, "text"), GetString(fact, "source_url")))
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static string JsonValueToString(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString() ?? string.Empty,
        JsonValueKind.Null or JsonValueKind.Undefined => string.Empty,
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        _ => value.GetRawText()
    };

    private static string GetAlias(IReadOnlyDictionary<string, string> record, IEnumerable<string> aliases)
    {
        foreach (var alias in aliases)
        {
            var match = record.FirstOrDefault(pair => NormalizeKey(pair.Key) == NormalizeKey(alias));
            if (!string.IsNullOrEmpty(match.Key))
            {
                return match.Value?.Trim() ?? string.Empty;
            }
        }

        return string.Empty;
    }

    private static string GetMappedValueOrAlias(
        IReadOnlyDictionary<string, string> record,
        string mappedKey,
        IEnumerable<string> aliases)
    {
        if (!string.IsNullOrWhiteSpace(mappedKey))
        {
            return record.TryGetValue(mappedKey, out var mappedValue) ? mappedValue?.Trim() ?? string.Empty : string.Empty;
        }

        return GetAlias(record, aliases);
    }

    private static string FindLikelyEmailColumn(IEnumerable<(string Header, IEnumerable<string> Values)> columns)
    {
        var candidates = ScoreEmailColumns(columns)
            .Where(candidate => candidate.Eligible)
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.Index)
            .ToList();
        if (candidates.Count == 0) return string.Empty;
        if (candidates.Count == 1) return candidates[0].Header;

        var best = candidates[0];
        var second = candidates[1];
        if (best.ExactAlias && !second.ExactAlias) return best.Header;
        return best.Score - second.Score >= 150 ? best.Header : string.Empty;
    }

    private static IReadOnlyList<EmailColumnScore> ScoreEmailColumns(
        IEnumerable<(string Header, IEnumerable<string> Values)> columns) =>
        columns.Select((column, index) => ScoreEmailColumn(column.Header, column.Values, index)).ToList();

    private static EmailColumnScore ScoreEmailColumn(string header, IEnumerable<string> values, int index)
    {
        var normalizedHeader = NormalizeKey(header);
        var exactAlias = EmailAliases.Any(alias => NormalizeKey(alias) == normalizedHeader);
        var hasKeyword = EmailHeaderKeywords.Any(keyword => normalizedHeader.Contains(NormalizeKey(keyword), StringComparison.Ordinal));
        var hasNegativeKeyword = EmailHeaderNegativeKeywords.Any(keyword => normalizedHeader.Contains(NormalizeKey(keyword), StringComparison.Ordinal));
        var samples = values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Take(50)
            .ToList();
        var validCount = samples.Count(value => EmailValueRegex.IsMatch(value));
        var validRatio = samples.Count == 0 ? 0d : (double)validCount / samples.Count;
        var eligible = exactAlias ||
            (!hasNegativeKeyword && hasKeyword && (samples.Count == 0 || validCount > 0 && validRatio >= 0.5d)) ||
            (!hasNegativeKeyword && !hasKeyword && samples.Count >= 2 && validCount >= 2 && validRatio >= 0.8d);
        var score = (exactAlias ? 1000 : 0)
            + (hasKeyword ? 400 : 0)
            + (int)Math.Round(validRatio * 400d, MidpointRounding.AwayFromZero)
            + Math.Min(validCount, 20) * 5
            - (hasNegativeKeyword ? 1000 : 0);
        return new EmailColumnScore(header, index, exactAlias, eligible, score);
    }

    private static bool ParseBoolean(string value) =>
        value.Equals("true", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("yes", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("y", StringComparison.OrdinalIgnoreCase) ||
        value.Equals("是", StringComparison.OrdinalIgnoreCase) ||
        value == "1";

    private static string NormalizeKey(string key) => new(key
        .Where(char.IsLetterOrDigit)
        .Select(char.ToLowerInvariant)
        .ToArray());

    private static string GetDisplayName(string key)
    {
        var normalized = NormalizeKey(key);
        if (NameAliases.Any(alias => NormalizeKey(alias) == normalized)) return "姓名";
        if (IsLikelyEmailHeader(key)) return "邮箱";
        if (RoleAliases.Any(alias => NormalizeKey(alias) == normalized)) return "目标岗位";
        if (ReviewAliases.Any(alias => NormalizeKey(alias) == normalized)) return "审核状态";
        if (SubjectAliases.Any(alias => NormalizeKey(alias) == normalized)) return "邮件主题";
        if (BodyHtmlAliases.Concat(BodyTextAliases).Any(alias => NormalizeKey(alias) == normalized)) return "邮件正文";
        if (ContentHashAliases.Any(alias => NormalizeKey(alias) == normalized)) return "内容哈希";
        if (FactsAliases.Any(alias => NormalizeKey(alias) == normalized)) return "个性化事实";
        if (OrganizationAliases.Any(alias => NormalizeKey(alias) == normalized)) return "机构";
        if (normalized is "country" or "countryregion" or "国家" or "国家地区") return "国家/地区";
        if (normalized is "conference" or "会议") return "会议";
        if (normalized is "papertitle" or "presentationtitle" or "论文标题" or "报告标题") return "论文标题";
        if (normalized is "linkedin" or "领英") return "LinkedIn";
        if (normalized is "graduationyear" or "毕业年份") return "毕业年份";
        return key;
    }

    private static bool IsDefaultVisible(string key)
    {
        var normalized = NormalizeKey(key);
        return NameAliases.Concat(RoleAliases).Concat(ReviewAliases)
            .Any(alias => NormalizeKey(alias) == normalized) ||
            IsLikelyEmailHeader(key) ||
            OrganizationAliases.Any(alias => NormalizeKey(alias) == normalized) ||
            normalized is "country" or "国家" or "国家地区";
    }

    private static bool IsLikelyEmailHeader(string header)
    {
        var normalizedHeader = NormalizeKey(header);
        if (EmailAliases.Any(alias => NormalizeKey(alias) == normalizedHeader)) return true;
        var hasKeyword = EmailHeaderKeywords.Any(keyword => normalizedHeader.Contains(NormalizeKey(keyword), StringComparison.Ordinal));
        var hasNegativeKeyword = EmailHeaderNegativeKeywords.Any(keyword => normalizedHeader.Contains(NormalizeKey(keyword), StringComparison.Ordinal));
        return hasKeyword && !hasNegativeKeyword;
    }

    private sealed record EmailColumnScore(string Header, int Index, bool ExactAlias, bool Eligible, int Score);

    private static IReadOnlyList<List<string>> ParseCsv(string text)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;

        for (var index = 0; index < text.Length; index++)
        {
            var character = text[index];
            if (inQuotes)
            {
                if (character == '"' && index + 1 < text.Length && text[index + 1] == '"')
                {
                    field.Append('"');
                    index++;
                }
                else if (character == '"')
                {
                    inQuotes = false;
                }
                else
                {
                    field.Append(character);
                }
            }
            else if (character == '"')
            {
                inQuotes = true;
            }
            else if (character == ',')
            {
                row.Add(field.ToString());
                field.Clear();
            }
            else if (character is '\r' or '\n')
            {
                if (character == '\r' && index + 1 < text.Length && text[index + 1] == '\n') index++;
                row.Add(field.ToString());
                field.Clear();
                rows.Add(row);
                row = [];
            }
            else
            {
                field.Append(character);
            }
        }

        if (field.Length > 0 || row.Count > 0)
        {
            row.Add(field.ToString());
            rows.Add(row);
        }

        return rows;
    }

    private static List<string> MakeUniqueHeaders(IReadOnlyList<string> rawHeaders)
    {
        var result = new List<string>();
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in rawHeaders)
        {
            var header = string.IsNullOrWhiteSpace(raw) ? $"Column {result.Count + 1}" : raw.Trim();
            counts.TryGetValue(header, out var count);
            count++;
            counts[header] = count;
            result.Add(count == 1 ? header : $"{header} ({count})");
        }

        return result;
    }

    private static IReadOnlyList<string> ReadSharedStrings(ZipArchive archive)
    {
        var entry = archive.GetEntry("xl/sharedStrings.xml");
        if (entry is null) return [];

        using var stream = entry.Open();
        var document = XDocument.Load(stream);
        XNamespace spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        return document.Descendants(spreadsheet + "si")
            .Select(item => string.Concat(item.Descendants(spreadsheet + "t").Select(text => text.Value)))
            .ToList();
    }

    private static IReadOnlyList<WorksheetReference> ResolveWorksheets(ZipArchive archive)
    {
        var workbookEntry = archive.GetEntry("xl/workbook.xml") ?? throw new InvalidDataException("Excel 缺少 workbook.xml。");
        var relationshipsEntry = archive.GetEntry("xl/_rels/workbook.xml.rels") ?? throw new InvalidDataException("Excel 缺少工作表关系文件。");
        XNamespace spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        XNamespace relationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        XNamespace packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";

        using var workbookStream = workbookEntry.Open();
        var workbook = XDocument.Load(workbookStream);
        using var relationshipsStream = relationshipsEntry.Open();
        var relationshipDocument = XDocument.Load(relationshipsStream);
        var targets = relationshipDocument.Descendants(packageRelationships + "Relationship")
            .Where(item => item.Attribute("Id") is not null && item.Attribute("Target") is not null)
            .ToDictionary(
                item => item.Attribute("Id")!.Value,
                item => NormalizeWorksheetPath(item.Attribute("Target")!.Value),
                StringComparer.OrdinalIgnoreCase);

        var worksheets = workbook.Descendants(spreadsheet + "sheet")
            .Select(sheet =>
            {
                var name = sheet.Attribute("name")?.Value ?? "工作表";
                var relationshipId = sheet.Attribute(relationships + "id")?.Value ?? string.Empty;
                return targets.TryGetValue(relationshipId, out var target)
                    ? new WorksheetReference(name, target)
                    : null;
            })
            .Where(worksheet => worksheet is not null)
            .Cast<WorksheetReference>()
            .ToList();
        return worksheets.Count > 0
            ? worksheets
            : throw new InvalidDataException("Excel 不包含可读取的工作表。");
    }

    private static string NormalizeWorksheetPath(string target)
    {
        var normalized = target.Replace('\\', '/').TrimStart('/');
        return normalized.StartsWith("xl/", StringComparison.OrdinalIgnoreCase) ? normalized : $"xl/{normalized}";
    }

    private static XlsxRow ReadXlsxRow(
        XElement row,
        XNamespace spreadsheet,
        IReadOnlyList<string> sharedStrings,
        int fallbackRowNumber)
    {
        var values = new Dictionary<int, string>();
        foreach (var cell in row.Elements(spreadsheet + "c"))
        {
            var reference = cell.Attribute("r")?.Value ?? string.Empty;
            var columnIndex = ColumnIndex(reference);
            var type = cell.Attribute("t")?.Value;
            var rawValue = cell.Element(spreadsheet + "v")?.Value ?? string.Empty;
            string value;

            if (type == "s" && int.TryParse(rawValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var sharedIndex) && sharedIndex >= 0 && sharedIndex < sharedStrings.Count)
            {
                value = sharedStrings[sharedIndex];
            }
            else if (type == "inlineStr")
            {
                value = string.Concat(cell.Descendants(spreadsheet + "t").Select(text => text.Value));
            }
            else if (type == "b")
            {
                value = rawValue == "1" ? "true" : "false";
            }
            else
            {
                value = rawValue;
            }

            values[columnIndex] = value;
        }

        var rowNumber = int.TryParse(row.Attribute("r")?.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedRowNumber)
            ? parsedRowNumber
            : fallbackRowNumber;
        return new XlsxRow(rowNumber, values);
    }

    private static int ColumnIndex(string cellReference)
    {
        var index = 0;
        foreach (var character in cellReference.TakeWhile(char.IsLetter))
        {
            index = index * 26 + (char.ToUpperInvariant(character) - 'A' + 1);
        }

        return Math.Max(0, index - 1);
    }

    private static bool TryGetProperty(JsonElement element, string propertyName, out JsonElement value)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (property.Name.Equals(propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static string GetString(JsonElement element, string propertyName) =>
        TryGetProperty(element, propertyName, out var value) ? JsonValueToString(value) : string.Empty;

    private sealed record WorksheetReference(string Name, string Path);

    private sealed record WorksheetCandidate(
        string Name,
        string Path,
        int WorkbookIndex,
        IReadOnlyList<XlsxRow> Rows,
        int HeaderRowNumber,
        int Score);

    private sealed record XlsxRow(int RowNumber, Dictionary<int, string> Cells);
}
