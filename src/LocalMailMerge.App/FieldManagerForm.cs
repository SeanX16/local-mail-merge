using LocalMailMerge.Core;

namespace LocalMailMerge.App;

internal sealed class FieldManagerForm : Form
{
    private readonly List<ImportField> _orderedFields;
    private readonly HashSet<string> _visibleKeys;
    private readonly TextBox _search = new();
    private readonly ListView _list = new();
    private bool _updating;

    public FieldManagerForm(IReadOnlyList<ImportField> fields, IReadOnlyList<string> visibleKeys)
    {
        _visibleKeys = new HashSet<string>(visibleKeys, StringComparer.OrdinalIgnoreCase);
        _orderedFields = visibleKeys
            .Select(key => fields.First(field => field.Key.Equals(key, StringComparison.OrdinalIgnoreCase)))
            .Concat(fields.Where(field => !_visibleKeys.Contains(field.Key)))
            .ToList();

        FormBorderStyle = FormBorderStyle.FixedSingle;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        ClientSize = new Size(300, 520);
        BackColor = Color.White;
        Font = new Font("Microsoft YaHei UI", 8F);
        Text = "选择显示字段";
        MinimizeBox = false;
        MaximizeBox = false;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 5,
            ColumnCount = 1,
            Padding = new Padding(12)
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        root.Controls.Add(new Label
        {
            Text = "选择显示字段",
            Dock = DockStyle.Fill,
            Font = new Font("Microsoft YaHei UI", 8.8F, FontStyle.Bold),
            ForeColor = AppTheme.TextPrimary
        }, 0, 0);

        _search.PlaceholderText = "搜索字段";
        _search.Dock = DockStyle.Fill;
        _search.Margin = new Padding(0, 4, 0, 7);
        root.Controls.Add(_search, 0, 1);
        root.Controls.Add(new Label
        {
            Text = "勾选显示；使用上移/下移调整顺序",
            Dock = DockStyle.Fill,
            ForeColor = AppTheme.TextMuted,
            Font = new Font("Microsoft YaHei UI", 7.2F)
        }, 0, 2);

        _list.Dock = DockStyle.Fill;
        _list.View = View.Details;
        _list.HeaderStyle = ColumnHeaderStyle.None;
        _list.CheckBoxes = true;
        _list.FullRowSelect = true;
        _list.HideSelection = false;
        _list.BorderStyle = BorderStyle.FixedSingle;
        _list.Columns.Add("字段", 250);
        root.Controls.Add(_list, 0, 3);

        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 5 };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 52));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 52));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 76));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 68));
        var reset = LinkButton("恢复默认");
        var moveUp = CompactButton("上移");
        var moveDown = CompactButton("下移");
        var cancel = CompactButton("取消");
        var done = AppTheme.PrimaryButton("完成", 62);
        done.Height = 34;
        done.Margin = new Padding(4, 6, 0, 4);
        footer.Controls.Add(reset, 0, 0);
        footer.Controls.Add(moveUp, 1, 0);
        footer.Controls.Add(moveDown, 2, 0);
        footer.Controls.Add(cancel, 3, 0);
        footer.Controls.Add(done, 4, 0);
        root.Controls.Add(footer, 0, 4);
        Controls.Add(root);

        _search.TextChanged += (_, _) => RebuildList();
        _list.ItemChecked += (_, e) =>
        {
            if (_updating || e.Item.Tag is not ImportField field) return;
            if (e.Item.Checked) _visibleKeys.Remove(field.Key);
            else _visibleKeys.Add(field.Key);
        };
        moveUp.Click += (_, _) => MoveSelected(-1);
        moveDown.Click += (_, _) => MoveSelected(1);
        reset.Click += (_, _) => ResetDefaults();
        cancel.Click += (_, _) => Close();
        done.Click += (_, _) => ApplyAndClose();
        RebuildList();
    }

    public event Action<IReadOnlyList<string>>? Applied;

    private void RebuildList()
    {
        var search = _search.Text.Trim();
        _updating = true;
        _list.BeginUpdate();
        try
        {
            _list.Items.Clear();
            foreach (var field in _orderedFields.Where(field =>
                         string.IsNullOrWhiteSpace(search) ||
                         field.DisplayName.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                         field.Key.Contains(search, StringComparison.OrdinalIgnoreCase)))
            {
                var item = new ListViewItem(field.DisplayName)
                {
                    Tag = field,
                    Checked = _visibleKeys.Contains(field.Key),
                    ToolTipText = field.Key
                };
                _list.Items.Add(item);
            }
        }
        finally
        {
            _list.EndUpdate();
            _updating = false;
        }
    }

    private void MoveSelected(int offset)
    {
        if (_list.SelectedItems.Count == 0 || _list.SelectedItems[0].Tag is not ImportField field) return;
        var index = _orderedFields.IndexOf(field);
        var target = index + offset;
        if (target < 0 || target >= _orderedFields.Count) return;
        _orderedFields.RemoveAt(index);
        _orderedFields.Insert(target, field);
        RebuildList();
        var visibleItem = _list.Items.Cast<ListViewItem>().FirstOrDefault(item => ReferenceEquals(item.Tag, field));
        if (visibleItem is not null) visibleItem.Selected = true;
    }

    private void ResetDefaults()
    {
        _visibleKeys.Clear();
        foreach (var field in _orderedFields.Where(field => field.DefaultVisible)) _visibleKeys.Add(field.Key);
        RebuildList();
    }

    private void ApplyAndClose()
    {
        if (_visibleKeys.Count == 0)
        {
            MessageBox.Show(this, "至少保留一个显示字段。", "字段管理", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Applied?.Invoke(_orderedFields.Where(field => _visibleKeys.Contains(field.Key)).Select(field => field.Key).ToList());
        Close();
    }

    private static Button CompactButton(string text)
    {
        var button = AppTheme.SecondaryButton(text, 48);
        button.Dock = DockStyle.Fill;
        button.Height = 34;
        button.Margin = new Padding(3, 6, 3, 4);
        return button;
    }

    private static Button LinkButton(string text)
    {
        var button = new Button
        {
            Text = text,
            Dock = DockStyle.Fill,
            FlatStyle = FlatStyle.Flat,
            ForeColor = AppTheme.Primary,
            BackColor = Color.White,
            TextAlign = ContentAlignment.MiddleLeft,
            Cursor = Cursors.Hand
        };
        button.FlatAppearance.BorderSize = 0;
        return button;
    }
}
