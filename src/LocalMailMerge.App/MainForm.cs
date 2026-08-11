using System.Net;
using System.Text.RegularExpressions;
using LocalMailMerge.Core;

namespace LocalMailMerge.App;

internal sealed class MainForm : Form
{
    private readonly bool _demoMode;
    private readonly PackageImporter _importer = new();
    private readonly ValidationService _validator = new();
    private readonly AuditStore _auditStore = new();
    private readonly OutlookDraftService _outlookService = new();
    private readonly Dictionary<string, HashSet<string>> _columnFilters = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<ImportField> _visibleFields = [];

    private readonly TextBox _pathText = new();
    private readonly ComboBox _accountCombo = new();
    private readonly TextBox _templateText = new();
    private readonly ComboBox _statusFilter = new();
    private readonly TextBox _searchText = new();
    private readonly Button _fieldManagerButton;
    private readonly Label _fieldCountLabel = new();
    private readonly Label _visibleCountLabel = new();
    private readonly DataGridView _grid = new();
    private readonly Label _totalValue = new();
    private readonly Label _eligibleValue = new();
    private readonly Label _reviewValue = new();
    private readonly Label _duplicateValue = new();
    private readonly Label _selectedCountLabel = new();
    private readonly Label _previewRecipient = new();
    private readonly Label _previewSubject = new();
    private readonly Label _previewValidation = new();
    private readonly WebBrowser _previewBrowser = new();
    private readonly Button _createDraftsButton;
    private readonly ToolTip _toolTip = new();

    private OutreachBatch? _batch;
    private bool _updatingGrid;
    private bool _demoLoaded;
    private Form? _openPopup;

    public MainForm(bool demoMode)
    {
        _demoMode = demoMode;
        Text = "Local Mail Merge";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1580, 995);
        MinimumSize = new Size(1180, 720);
        BackColor = Color.White;
        Font = new Font("Microsoft YaHei UI", 8F);
        AutoScaleMode = AutoScaleMode.Dpi;

        _fieldManagerButton = AppTheme.SecondaryButton("字段管理", 116);
        _createDraftsButton = AppTheme.PrimaryButton("创建所选草稿", 250);

        BuildLayout();
        WireEvents();
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (_demoMode)
        {
            await LoadDemoAsync().ConfigureAwait(true);
        }
        else
        {
            await RefreshAccountsAsync().ConfigureAwait(true);
        }
    }

    public async Task LoadDemoAsync()
    {
        if (_demoLoaded) return;
        _demoLoaded = true;
        _accountCombo.Items.Clear();
        _accountCombo.Items.Add(new OutlookAccountInfo(1, "John Doe", "john.doe@example.test", "demo-store"));
        _accountCombo.SelectedIndex = 0;

        var template = Path.Combine(AppContext.BaseDirectory, "templates", "company_signature.sample.html");
        var sample = Path.Combine(AppContext.BaseDirectory, "samples", "outreach_package.sample.json");
        _templateText.Text = template;
        if (File.Exists(sample))
        {
            await LoadPackageAsync(sample).ConfigureAwait(true);
        }
    }

    public void CaptureTo(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
        using var bitmap = new Bitmap(ClientSize.Width, ClientSize.Height);
        DrawToBitmap(bitmap, new Rectangle(Point.Empty, ClientSize));
        bitmap.Save(path, System.Drawing.Imaging.ImageFormat.Png);
    }

    private void BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            BackColor = Color.White,
            Padding = Padding.Empty
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 78));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 62));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
        root.Controls.Add(BuildHeader(), 0, 0);
        root.Controls.Add(BuildSummary(), 0, 1);
        root.Controls.Add(BuildContent(), 0, 2);
        root.Controls.Add(BuildFooter(), 0, 3);
        Controls.Add(root);
    }

    private Control BuildHeader()
    {
        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 4,
            BackColor = Color.White,
            Padding = new Padding(18, 14, 18, 10)
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 185));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 44));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 31));

        var importButton = AppTheme.PrimaryButton("导入交接包", 166);
        importButton.Name = "ImportButton";
        importButton.Margin = new Padding(0, 0, 12, 0);
        header.Controls.Add(importButton, 0, 0);

        ConfigureTextBox(_pathText, "选择 JSON、CSV 或 XLSX 文件");
        _pathText.ReadOnly = true;
        _pathText.Dock = DockStyle.Fill;
        _pathText.Margin = new Padding(4, 4, 18, 4);
        header.Controls.Add(_pathText, 1, 0);

        var accountPanel = LabeledControl("Outlook 账户", _accountCombo);
        _accountCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _accountCombo.Dock = DockStyle.Fill;
        accountPanel.Margin = new Padding(0, 0, 18, 0);
        header.Controls.Add(accountPanel, 2, 0);

        var templatePanel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, Margin = Padding.Empty };
        templatePanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88));
        templatePanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        templatePanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88));
        templatePanel.Controls.Add(new Label
        {
            Text = "邮件签名",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = AppTheme.TextPrimary
        }, 0, 0);
        ConfigureTextBox(_templateText, "选择 .oft 或 HTML");
        _templateText.ReadOnly = true;
        _templateText.Dock = DockStyle.Fill;
        _templateText.Margin = new Padding(0, 4, 6, 4);
        templatePanel.Controls.Add(_templateText, 1, 0);
        var browseTemplate = AppTheme.SecondaryButton("选择模板", 82);
        browseTemplate.Name = "BrowseTemplateButton";
        browseTemplate.Dock = DockStyle.Fill;
        browseTemplate.Margin = new Padding(0, 4, 0, 4);
        templatePanel.Controls.Add(browseTemplate, 2, 0);
        header.Controls.Add(templatePanel, 3, 0);
        return header;
    }

    private Control BuildSummary()
    {
        var summary = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 5,
            BackColor = AppTheme.SurfaceMuted,
            Padding = new Padding(18, 5, 18, 5)
        };
        summary.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 205));
        summary.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 205));
        summary.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 205));
        summary.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 205));
        summary.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        summary.Controls.Add(SummaryCard("共", _totalValue, AppTheme.Primary), 0, 0);
        summary.Controls.Add(SummaryCard("可创建", _eligibleValue, AppTheme.Success), 1, 0);
        summary.Controls.Add(SummaryCard("需复核", _reviewValue, AppTheme.Warning), 2, 0);
        summary.Controls.Add(SummaryCard("重复", _duplicateValue, AppTheme.Danger), 3, 0);
        return summary;
    }

    private Control BuildContent()
    {
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Vertical,
            SplitterWidth = 1,
            BackColor = AppTheme.Border
        };
        split.Resize += (_, _) =>
        {
            const int minimumLeft = 560;
            const int minimumRight = 320;
            if (split.Width < minimumLeft + minimumRight + split.SplitterWidth) return;
            var desired = (int)Math.Round(split.Width * 0.68, MidpointRounding.AwayFromZero);
            split.SplitterDistance = Math.Clamp(
                desired,
                minimumLeft,
                split.Width - minimumRight - split.SplitterWidth);
        };

        var left = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            ColumnCount = 1,
            Padding = new Padding(18, 10, 10, 12),
            BackColor = Color.White
        };
        left.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        left.Controls.Add(BuildTableToolbar(), 0, 0);
        ConfigureGrid();
        left.Controls.Add(_grid, 0, 1);
        split.Panel1.Controls.Add(left);
        split.Panel2.Controls.Add(BuildPreview());
        return split;
    }

    private Control BuildTableToolbar()
    {
        var toolbar = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 6, BackColor = Color.White };
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 250));
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 125));
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 150));
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 175));

        _statusFilter.Items.AddRange(["全部状态", "仅看可创建", "仅看需复核", "仅看重复", "仅看已拦截", "仅看已选择"]);
        _statusFilter.SelectedIndex = 0;
        _statusFilter.DropDownStyle = ComboBoxStyle.DropDownList;
        _statusFilter.Dock = DockStyle.Fill;
        _statusFilter.Margin = new Padding(0, 7, 10, 7);
        toolbar.Controls.Add(_statusFilter, 0, 0);

        ConfigureTextBox(_searchText, "搜索姓名或邮箱");
        _searchText.Dock = DockStyle.Fill;
        _searchText.Margin = new Padding(0, 7, 12, 7);
        toolbar.Controls.Add(_searchText, 1, 0);

        _fieldManagerButton.Dock = DockStyle.Fill;
        _fieldManagerButton.Margin = new Padding(0, 7, 10, 7);
        toolbar.Controls.Add(_fieldManagerButton, 2, 0);

        _fieldCountLabel.Dock = DockStyle.Fill;
        _fieldCountLabel.TextAlign = ContentAlignment.MiddleLeft;
        _fieldCountLabel.ForeColor = AppTheme.TextMuted;
        toolbar.Controls.Add(_fieldCountLabel, 3, 0);

        _visibleCountLabel.Dock = DockStyle.Fill;
        _visibleCountLabel.TextAlign = ContentAlignment.MiddleRight;
        _visibleCountLabel.ForeColor = AppTheme.TextMuted;
        toolbar.Controls.Add(_visibleCountLabel, 5, 0);
        return toolbar;
    }

    private void ConfigureGrid()
    {
        _grid.Dock = DockStyle.Fill;
        _grid.BackgroundColor = Color.White;
        _grid.BorderStyle = BorderStyle.FixedSingle;
        _grid.GridColor = Color.FromArgb(232, 235, 240);
        _grid.AllowUserToAddRows = false;
        _grid.AllowUserToDeleteRows = false;
        _grid.AllowUserToResizeRows = false;
        _grid.AllowUserToOrderColumns = false;
        _grid.RowHeadersVisible = false;
        _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _grid.MultiSelect = false;
        _grid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.None;
        _grid.RowTemplate.Height = 34;
        _grid.ColumnHeadersHeight = 40;
        _grid.EnableHeadersVisualStyles = false;
        _grid.ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle
        {
            BackColor = Color.White,
            ForeColor = AppTheme.TextPrimary,
            Font = new Font("Microsoft YaHei UI", 8F, FontStyle.Bold),
            Alignment = DataGridViewContentAlignment.MiddleLeft,
            SelectionBackColor = Color.White,
            SelectionForeColor = AppTheme.TextPrimary
        };
        _grid.DefaultCellStyle = new DataGridViewCellStyle
        {
            BackColor = Color.White,
            ForeColor = AppTheme.TextPrimary,
            Font = new Font("Microsoft YaHei UI", 7.5F),
            SelectionBackColor = AppTheme.Selection,
            SelectionForeColor = AppTheme.TextPrimary,
            Padding = new Padding(5, 0, 5, 0)
        };
        _grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
        _grid.ScrollBars = ScrollBars.Both;
    }

    private Control BuildPreview()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 5,
            ColumnCount = 1,
            BackColor = Color.White,
            Padding = new Padding(20, 12, 18, 12)
        };
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 92));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 1));
        panel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 80));
        panel.Controls.Add(new Label
        {
            Text = "邮件预览",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Microsoft YaHei UI", 9.5F, FontStyle.Bold),
            ForeColor = AppTheme.TextPrimary
        }, 0, 0);

        var metadata = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 2 };
        metadata.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
        metadata.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        metadata.Controls.Add(MetaLabel("收件人："), 0, 0);
        metadata.Controls.Add(_previewRecipient, 1, 0);
        metadata.Controls.Add(MetaLabel("主题："), 0, 1);
        metadata.Controls.Add(_previewSubject, 1, 1);
        ConfigurePreviewValue(_previewRecipient);
        ConfigurePreviewValue(_previewSubject);
        panel.Controls.Add(metadata, 0, 1);
        panel.Controls.Add(new Panel { Dock = DockStyle.Fill, BackColor = AppTheme.Border }, 0, 2);

        _previewBrowser.Dock = DockStyle.Fill;
        _previewBrowser.AllowNavigation = false;
        _previewBrowser.AllowWebBrowserDrop = false;
        _previewBrowser.IsWebBrowserContextMenuEnabled = false;
        _previewBrowser.WebBrowserShortcutsEnabled = false;
        _previewBrowser.ScriptErrorsSuppressed = true;
        panel.Controls.Add(_previewBrowser, 0, 3);

        _previewValidation.Dock = DockStyle.Fill;
        _previewValidation.Padding = new Padding(10);
        _previewValidation.BackColor = AppTheme.SurfaceMuted;
        _previewValidation.ForeColor = AppTheme.TextMuted;
        _previewValidation.AutoEllipsis = true;
        panel.Controls.Add(_previewValidation, 0, 4);
        return panel;
    }

    private Control BuildFooter()
    {
        var footer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            BackColor = AppTheme.SurfaceMuted,
            Padding = new Padding(20, 7, 18, 7)
        };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 270));
        _selectedCountLabel.Dock = DockStyle.Fill;
        _selectedCountLabel.Text = "已选择 0 人";
        _selectedCountLabel.TextAlign = ContentAlignment.MiddleLeft;
        _selectedCountLabel.Font = new Font("Microsoft YaHei UI", 8.6F, FontStyle.Bold);
        footer.Controls.Add(_selectedCountLabel, 0, 0);
        _createDraftsButton.Dock = DockStyle.Fill;
        footer.Controls.Add(_createDraftsButton, 1, 0);
        return footer;
    }

    private void WireEvents()
    {
        Controls.Find("ImportButton", true).OfType<Button>().Single().Click += async (_, _) => await ChoosePackageAsync().ConfigureAwait(true);
        Controls.Find("BrowseTemplateButton", true).OfType<Button>().Single().Click += (_, _) => ChooseTemplate();
        _statusFilter.SelectedIndexChanged += (_, _) => ApplyFilters();
        _searchText.TextChanged += (_, _) => ApplyFilters();
        _fieldManagerButton.Click += (_, _) => OpenFieldManager();
        _grid.ColumnHeaderMouseClick += (_, e) => OpenColumnFilter(e.ColumnIndex);
        _grid.SelectionChanged += (_, _) => ShowSelectedPreview();
        _grid.CurrentCellDirtyStateChanged += (_, _) =>
        {
            if (_grid.IsCurrentCellDirty) _grid.CommitEdit(DataGridViewDataErrorContexts.Commit);
        };
        _grid.CellValueChanged += (_, e) => UpdateRowSelection(e.RowIndex, e.ColumnIndex);
        _grid.CellToolTipTextNeeded += (_, e) => ProvideCellToolTip(e);
        _createDraftsButton.Click += async (_, _) => await CreateSelectedDraftsAsync().ConfigureAwait(true);
        Resize += (_, _) => AppTheme.Round(_createDraftsButton);
    }

    private async Task ChoosePackageAsync()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "选择邮件交接包或审核表",
            Filter = "支持的文件 (*.json;*.xlsx;*.csv)|*.json;*.xlsx;*.csv|JSON (*.json)|*.json|Excel (*.xlsx)|*.xlsx|CSV (*.csv)|*.csv",
            CheckFileExists = true,
            Multiselect = false
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            await LoadPackageAsync(dialog.FileName).ConfigureAwait(true);
        }
    }

    private async Task LoadPackageAsync(string path)
    {
        SetBusy(true, "正在导入并校验…");
        try
        {
            _batch = await _importer.ImportAsync(path).ConfigureAwait(true);
            _validator.Validate(_batch, _demoMode ? new HashSet<string>() : _auditStore.LoadSuccessfulKeys());
            _pathText.Text = path;
            _columnFilters.Clear();
            _visibleFields.Clear();
            _visibleFields.AddRange(_batch.Fields.Where(field => field.DefaultVisible));
            if (_visibleFields.Count == 0) _visibleFields.AddRange(_batch.Fields.Take(7));
            BuildGridColumns();
            ApplyFilters();
            UpdateSummary();
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "导入失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async Task RefreshAccountsAsync()
    {
        _accountCombo.Items.Clear();
        _accountCombo.Items.Add("正在读取 Outlook 账户…");
        _accountCombo.SelectedIndex = 0;
        try
        {
            var accounts = await _outlookService.GetAccountsAsync().ConfigureAwait(true);
            _accountCombo.Items.Clear();
            foreach (var account in accounts) _accountCombo.Items.Add(account);
            if (_accountCombo.Items.Count > 0) _accountCombo.SelectedIndex = 0;
            else _accountCombo.Items.Add("未检测到可用 Outlook 账户");
        }
        catch (Exception exception)
        {
            _accountCombo.Items.Clear();
            _accountCombo.Items.Add("经典 Outlook 不可用");
            _accountCombo.SelectedIndex = 0;
            _toolTip.SetToolTip(_accountCombo, exception.Message);
        }
    }

    private void ChooseTemplate()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "选择公司批准的 Outlook 模板或签名 HTML",
            Filter = "Outlook/HTML 模板 (*.oft;*.html;*.htm)|*.oft;*.html;*.htm|Outlook 模板 (*.oft)|*.oft|HTML (*.html;*.htm)|*.html;*.htm",
            CheckFileExists = true
        };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            _templateText.Text = dialog.FileName;
            ShowSelectedPreview();
        }
    }

    private void BuildGridColumns()
    {
        _updatingGrid = true;
        try
        {
            _grid.Columns.Clear();
            _grid.Columns.Add(new DataGridViewCheckBoxColumn
            {
                Name = "__selected",
                HeaderText = string.Empty,
                Width = 42,
                Frozen = true,
                SortMode = DataGridViewColumnSortMode.NotSortable
            });

            foreach (var field in _visibleFields)
            {
                var width = field.DisplayName switch
                {
                    "姓名" => 150,
                    "邮箱" => 245,
                    "目标岗位" => 205,
                    "审核状态" or "校验结果" => 125,
                    _ => 155
                };
                _grid.Columns.Add(new DataGridViewTextBoxColumn
                {
                    Name = field.Key,
                    HeaderText = HeaderText(field),
                    Width = width,
                    SortMode = DataGridViewColumnSortMode.NotSortable
                });
            }
        }
        finally
        {
            _updatingGrid = false;
        }
        UpdateFieldCount();
    }

    private string HeaderText(ImportField field) =>
        _columnFilters.ContainsKey(field.Key) ? $"{field.DisplayName}  ●  ▾" : $"{field.DisplayName}  ▾";

    private void ApplyFilters()
    {
        if (_batch is null) return;
        var search = _searchText.Text.Trim();
        var filtered = _batch.Messages.Where(message => MatchesStatus(message) && MatchesColumns(message));
        if (!string.IsNullOrWhiteSpace(search) && search != _searchText.PlaceholderText)
        {
            filtered = filtered.Where(message =>
                message.RecipientName.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                message.RecipientEmail.Contains(search, StringComparison.OrdinalIgnoreCase));
        }

        PopulateRows(filtered.ToList());
        UpdateFieldCount();
        UpdateSelectedCount();
    }

    private bool MatchesStatus(OutreachMessage message) => _statusFilter.SelectedIndex switch
    {
        1 => message.Validation.State == ValidationState.Eligible,
        2 => message.Validation.State == ValidationState.NeedsReview,
        3 => message.Validation.State == ValidationState.Duplicate,
        4 => message.Validation.State == ValidationState.Blocked,
        5 => message.IsSelected,
        _ => true
    };

    private bool MatchesColumns(OutreachMessage message) => _columnFilters.All(filter =>
        filter.Value.Contains(message.GetFieldValue(filter.Key)));

    private void PopulateRows(IReadOnlyList<OutreachMessage> messages)
    {
        _updatingGrid = true;
        try
        {
            _grid.Rows.Clear();
            foreach (var message in messages)
            {
                var values = new object[_grid.Columns.Count];
                values[0] = message.IsSelected;
                for (var index = 0; index < _visibleFields.Count; index++)
                {
                    values[index + 1] = message.GetFieldValue(_visibleFields[index].Key);
                }

                var rowIndex = _grid.Rows.Add(values);
                var row = _grid.Rows[rowIndex];
                row.Tag = message;
                var checkbox = row.Cells[0];
                checkbox.ReadOnly = !message.Validation.CanCreate;
                if (!message.Validation.CanCreate)
                {
                    checkbox.Style.BackColor = AppTheme.SurfaceMuted;
                    checkbox.Style.ForeColor = AppTheme.TextMuted;
                }

                StyleStatusCells(row, message);
            }

            if (_grid.Rows.Count > 0)
            {
                _grid.ClearSelection();
                _grid.Rows[0].Selected = true;
                _grid.CurrentCell = _grid.Rows[0].Cells[Math.Min(1, _grid.Columns.Count - 1)];
            }
            else
            {
                ClearPreview();
            }
        }
        finally
        {
            _updatingGrid = false;
        }
    }

    private void StyleStatusCells(DataGridViewRow row, OutreachMessage message)
    {
        for (var index = 0; index < _visibleFields.Count; index++)
        {
            var field = _visibleFields[index];
            var cell = row.Cells[index + 1];
            if (field.Key == ValidationService.ValidationFieldKey)
            {
                ApplyStatusStyle(cell, message.Validation.State switch
                {
                    ValidationState.Eligible => AppTheme.Success,
                    ValidationState.Duplicate => AppTheme.Danger,
                    ValidationState.Blocked => AppTheme.Danger,
                    _ => AppTheme.Warning
                });
            }
            else if (field.DisplayName == "审核状态")
            {
                var approved = message.ReviewStatus.Equals("Approved", StringComparison.OrdinalIgnoreCase) ||
                               message.ReviewStatus.Equals("已批准", StringComparison.OrdinalIgnoreCase);
                ApplyStatusStyle(cell, approved ? AppTheme.Success : AppTheme.Warning);
            }
        }
    }

    private static void ApplyStatusStyle(DataGridViewCell cell, Color color)
    {
        cell.Style.ForeColor = color;
        cell.Style.Font = new Font("Microsoft YaHei UI", 7.3F, FontStyle.Bold);
        cell.Style.Alignment = DataGridViewContentAlignment.MiddleCenter;
    }

    private void UpdateRowSelection(int rowIndex, int columnIndex)
    {
        if (_updatingGrid || rowIndex < 0 || columnIndex != 0) return;
        var row = _grid.Rows[rowIndex];
        if (row.Tag is not OutreachMessage message || !message.Validation.CanCreate) return;
        message.IsSelected = Convert.ToBoolean(row.Cells[0].Value, System.Globalization.CultureInfo.InvariantCulture);
        UpdateSelectedCount();
    }

    private void OpenFieldManager()
    {
        if (_batch is null) return;
        ClosePopup();
        var popup = new FieldManagerForm(_batch.Fields, _visibleFields.Select(field => field.Key).ToList());
        popup.Applied += keys =>
        {
            _visibleFields.Clear();
            foreach (var key in keys)
            {
                var field = _batch.Fields.FirstOrDefault(item => item.Key.Equals(key, StringComparison.OrdinalIgnoreCase));
                if (field is not null) _visibleFields.Add(field);
            }
            BuildGridColumns();
            ApplyFilters();
        };
        ShowPopup(popup, _fieldManagerButton.PointToScreen(new Point(0, _fieldManagerButton.Height + 2)));
    }

    private void OpenColumnFilter(int columnIndex)
    {
        if (_batch is null || columnIndex <= 0 || columnIndex >= _grid.Columns.Count) return;
        var key = _grid.Columns[columnIndex].Name;
        var field = _batch.Fields.FirstOrDefault(item => item.Key.Equals(key, StringComparison.OrdinalIgnoreCase));
        if (field is null) return;
        ClosePopup();
        var values = _batch.Messages.Select(message => message.GetFieldValue(key)).Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value, StringComparer.CurrentCultureIgnoreCase).ToList();
        _columnFilters.TryGetValue(key, out var selected);
        var popup = new ColumnFilterForm(field.DisplayName, values, selected);
        popup.Applied += selection =>
        {
            if (selection is null || selection.Count == values.Count) _columnFilters.Remove(key);
            else _columnFilters[key] = selection;
            _grid.Columns[columnIndex].HeaderText = HeaderText(field);
            ApplyFilters();
        };
        var headerRect = _grid.GetCellDisplayRectangle(columnIndex, -1, true);
        ShowPopup(popup, _grid.PointToScreen(new Point(headerRect.Left, headerRect.Bottom)));
    }

    private void ShowPopup(Form popup, Point preferredLocation)
    {
        _openPopup = popup;
        var screen = Screen.FromPoint(preferredLocation).WorkingArea;
        var x = Math.Min(preferredLocation.X, screen.Right - popup.Width);
        var y = preferredLocation.Y + popup.Height <= screen.Bottom
            ? preferredLocation.Y
            : Math.Max(screen.Top, preferredLocation.Y - popup.Height - 42);
        popup.Location = new Point(Math.Max(screen.Left, x), y);
        popup.FormClosed += (_, _) => { if (ReferenceEquals(_openPopup, popup)) _openPopup = null; };
        popup.Show(this);
    }

    private void ClosePopup()
    {
        if (_openPopup is null) return;
        _openPopup.Close();
        _openPopup = null;
    }

    private void ShowSelectedPreview()
    {
        var message = _grid.SelectedRows.Count > 0 ? _grid.SelectedRows[0].Tag as OutreachMessage : null;
        if (message is null)
        {
            ClearPreview();
            return;
        }

        _previewRecipient.Text = $"{message.RecipientName} <{message.RecipientEmail}>";
        _previewSubject.Text = message.Subject;
        _previewValidation.Text = message.Validation.CanCreate
            ? "✓ 校验通过。该记录可由用户勾选并创建为 Outlook 草稿。"
            : message.Validation.DetailText;
        _previewValidation.ForeColor = message.Validation.CanCreate ? AppTheme.Success : AppTheme.Danger;
        _previewBrowser.DocumentText = BuildPreviewHtml(message);
    }

    private string BuildPreviewHtml(OutreachMessage message)
    {
        var body = SanitizeHtml(message.EffectiveBodyHtml);
        var signature = string.Empty;
        if (File.Exists(_templateText.Text) && Path.GetExtension(_templateText.Text).ToLowerInvariant() is ".html" or ".htm")
        {
            signature = SanitizeHtml(File.ReadAllText(_templateText.Text));
        }
        else if (!string.IsNullOrWhiteSpace(_templateText.Text))
        {
            signature = $"<div class=\"signature-note\">公司 Outlook 模板：{WebUtility.HtmlEncode(Path.GetFileName(_templateText.Text))}</div>";
        }

        return $$"""
            <!doctype html>
            <html><head><meta charset="utf-8"><style>
            body { font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif; color:#1f2937; font-size:10px; line-height:1.6; margin:18px 12px; overflow-wrap:anywhere; zoom:0.78; }
            a { color:#0f5bbe; } .signature-note { margin-top:28px; padding-top:16px; border-top:1px solid #daddE6; color:#606a78; }
            </style></head><body>{{body}}<div class="signature-note">{{signature}}</div></body></html>
            """;
    }

    private static string SanitizeHtml(string html)
    {
        var value = Regex.Replace(html, @"<script\b[^>]*>[\s\S]*?</script>", string.Empty, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        value = Regex.Replace(value, @"<(iframe|object|embed|img|link)\b[^>]*>", string.Empty, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        value = Regex.Replace(value, @"\son\w+\s*=\s*(['""]).*?\1", string.Empty, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        value = Regex.Replace(value, @"\s(src|style)\s*=\s*(['""]).*?\2", string.Empty, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return value;
    }

    private void ClearPreview()
    {
        _previewRecipient.Text = "—";
        _previewSubject.Text = "—";
        _previewValidation.Text = "请选择左侧的一位人员查看邮件。";
        _previewValidation.ForeColor = AppTheme.TextMuted;
        _previewBrowser.DocumentText = "<html><body></body></html>";
    }

    private async Task CreateSelectedDraftsAsync()
    {
        if (_batch is null)
        {
            MessageBox.Show(this, "请先导入邮件交接包。", "尚未导入", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var selected = _batch.Messages.Where(message => message.IsSelected && message.Validation.CanCreate).ToList();
        if (selected.Count == 0)
        {
            MessageBox.Show(this, "当前没有已勾选且校验通过的记录。", "没有可创建项目", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (_demoMode)
        {
            MessageBox.Show(this, $"演示模式已选择 {selected.Count} 人，不会连接 Outlook 或创建草稿。", "演示模式", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (_accountCombo.SelectedItem is not OutlookAccountInfo account)
        {
            MessageBox.Show(this, "必须明确选择一个 Outlook 发件账户。", "缺少发件账户", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (!File.Exists(_templateText.Text))
        {
            MessageBox.Show(this, "必须选择公司批准的 .oft 或 HTML 邮件签名。", "缺少邮件签名", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var confirmation = MessageBox.Show(
            this,
            $"将使用账户：\n{account}\n\n为 {selected.Count} 人创建 Outlook 草稿。\n\n程序只保存草稿，不会打开撰写窗口，也不会发送邮件。是否继续？",
            "确认创建草稿",
            MessageBoxButtons.OKCancel,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);
        if (confirmation != DialogResult.OK) return;

        SetBusy(true, $"正在创建 0 / {selected.Count}…");
        var progress = new Progress<(int Completed, int Total)>(value =>
        {
            _createDraftsButton.Text = $"正在创建 {value.Completed} / {value.Total}";
        });
        try
        {
            var results = await _outlookService.CreateDraftsAsync(selected, account, _templateText.Text, _auditStore, progress).ConfigureAwait(true);
            var reportPath = await _auditStore.WriteReportAsync(_batch.BatchId, results).ConfigureAwait(true);
            _validator.Validate(_batch, _auditStore.LoadSuccessfulKeys());
            ApplyFilters();
            UpdateSummary();
            MessageBox.Show(
                this,
                $"草稿创建完成。\n\n成功：{results.Count(result => result.Outcome == "Success")}\n失败：{results.Count(result => result.Outcome == "Failed")}\n\n本地报告：{reportPath}",
                "创建结果",
                MessageBoxButtons.OK,
                results.Any(result => result.Outcome == "Failed") ? MessageBoxIcon.Warning : MessageBoxIcon.Information);
        }
        catch (Exception exception)
        {
            MessageBox.Show(this, exception.Message, "无法创建草稿", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void UpdateSummary()
    {
        if (_batch is null) return;
        _totalValue.Text = _batch.Messages.Count.ToString(System.Globalization.CultureInfo.InvariantCulture);
        _eligibleValue.Text = _batch.Messages.Count(message => message.Validation.State == ValidationState.Eligible).ToString(System.Globalization.CultureInfo.InvariantCulture);
        _reviewValue.Text = _batch.Messages.Count(message => message.Validation.State is ValidationState.NeedsReview or ValidationState.Blocked).ToString(System.Globalization.CultureInfo.InvariantCulture);
        _duplicateValue.Text = _batch.Messages.Count(message => message.Validation.State == ValidationState.Duplicate).ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    private void UpdateFieldCount()
    {
        var total = _batch?.Fields.Count ?? 0;
        _fieldCountLabel.Text = $"显示 {_visibleFields.Count} / {total} 个字段";
        _visibleCountLabel.Text = _batch is null ? "当前显示 0 / 0 人" : $"当前显示 {_grid.Rows.Count} / {_batch.Messages.Count} 人";
    }

    private void UpdateSelectedCount()
    {
        var count = _batch?.Messages.Count(message => message.IsSelected && message.Validation.CanCreate) ?? 0;
        _selectedCountLabel.Text = $"已选择 {count} 人";
        _createDraftsButton.Enabled = count > 0;
    }

    private void SetBusy(bool busy, string? text = null)
    {
        UseWaitCursor = busy;
        _createDraftsButton.Enabled = !busy && (_batch?.Messages.Any(message => message.IsSelected && message.Validation.CanCreate) ?? false);
        _createDraftsButton.Text = busy ? text ?? "处理中…" : "创建所选草稿";
    }

    private void ProvideCellToolTip(DataGridViewCellToolTipTextNeededEventArgs e)
    {
        if (e.RowIndex < 0 || _grid.Rows[e.RowIndex].Tag is not OutreachMessage message) return;
        if (e.ColumnIndex >= 0 && _grid.Columns[e.ColumnIndex].Name == ValidationService.ValidationFieldKey)
        {
            e.ToolTipText = message.Validation.DetailText;
        }
    }

    private static Control LabeledControl(string labelText, Control control)
    {
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Margin = Padding.Empty };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 118));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.Controls.Add(new Label
        {
            Text = labelText,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = AppTheme.TextPrimary
        }, 0, 0);
        control.Margin = new Padding(0, 4, 0, 4);
        panel.Controls.Add(control, 1, 0);
        return panel;
    }

    private static Control SummaryCard(string caption, Label valueLabel, Color accent)
    {
        var panel = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            BackColor = Color.White,
            Margin = new Padding(0, 0, 1, 0),
            Padding = new Padding(18, 7, 8, 4)
        };
        panel.Controls.Add(new Label
        {
            Text = caption,
            AutoSize = true,
            ForeColor = AppTheme.TextMuted,
            Margin = new Padding(0, 6, 8, 0)
        });
        valueLabel.Text = "0";
        valueLabel.AutoSize = true;
        valueLabel.Font = new Font("Microsoft YaHei UI", 10.5F, FontStyle.Bold);
        valueLabel.ForeColor = accent;
        valueLabel.Margin = new Padding(0, 1, 0, 0);
        panel.Controls.Add(valueLabel);
        return panel;
    }

    private static Label MetaLabel(string text) => new()
    {
        Text = text,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft,
        Font = new Font("Microsoft YaHei UI", 8F, FontStyle.Bold),
        ForeColor = AppTheme.TextPrimary
    };

    private static void ConfigurePreviewValue(Label label)
    {
        label.Dock = DockStyle.Fill;
        label.TextAlign = ContentAlignment.MiddleLeft;
        label.AutoEllipsis = true;
        label.ForeColor = AppTheme.TextPrimary;
    }

    private static void ConfigureTextBox(TextBox textBox, string placeholder)
    {
        textBox.BorderStyle = BorderStyle.FixedSingle;
        textBox.PlaceholderText = placeholder;
        textBox.Font = new Font("Microsoft YaHei UI", 8F);
        textBox.BackColor = Color.White;
    }
}
