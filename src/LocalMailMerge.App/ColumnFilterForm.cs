namespace LocalMailMerge.App;

internal sealed class ColumnFilterForm : Form
{
    private readonly IReadOnlyList<string> _allValues;
    private readonly HashSet<string> _checkedValues;
    private readonly TextBox _search = new();
    private readonly CheckedListBox _values = new();
    private readonly CheckBox _selectAll = new();
    private bool _updating;

    public ColumnFilterForm(string fieldName, IReadOnlyList<string> values, IReadOnlySet<string>? selected)
    {
        _allValues = values;
        _checkedValues = selected is null
            ? new HashSet<string>(values, StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(selected, StringComparer.OrdinalIgnoreCase);

        FormBorderStyle = FormBorderStyle.FixedSingle;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        ClientSize = new Size(285, 400);
        BackColor = Color.White;
        Font = new Font("Microsoft YaHei UI", 8F);
        Text = $"筛选：{fieldName}";
        MinimizeBox = false;
        MaximizeBox = false;

        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 5,
            ColumnCount = 1,
            Padding = new Padding(12)
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));

        _search.PlaceholderText = "搜索";
        _search.Dock = DockStyle.Fill;
        _search.Margin = new Padding(0, 3, 0, 7);
        root.Controls.Add(_search, 0, 0);
        _selectAll.Text = "全选";
        _selectAll.Dock = DockStyle.Fill;
        _selectAll.Checked = _checkedValues.Count == _allValues.Count;
        root.Controls.Add(_selectAll, 0, 1);
        _values.Dock = DockStyle.Fill;
        _values.BorderStyle = BorderStyle.FixedSingle;
        _values.CheckOnClick = true;
        root.Controls.Add(_values, 0, 2);
        root.Controls.Add(new Label
        {
            Text = $"共 {_allValues.Count} 个不同值",
            Dock = DockStyle.Fill,
            ForeColor = AppTheme.TextMuted,
            TextAlign = ContentAlignment.MiddleLeft
        }, 0, 3);

        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 4 };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 66));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 66));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 66));
        var clear = LinkButton("清除筛选");
        var cancel = CompactButton("取消");
        var apply = AppTheme.PrimaryButton("应用", 62);
        apply.Height = 34;
        apply.Margin = new Padding(4, 6, 0, 4);
        footer.Controls.Add(clear, 0, 0);
        footer.Controls.Add(cancel, 2, 0);
        footer.Controls.Add(apply, 3, 0);
        root.Controls.Add(footer, 0, 4);
        Controls.Add(root);

        _search.TextChanged += (_, _) => RebuildValues();
        _values.ItemCheck += (_, e) =>
        {
            if (_updating) return;
            var value = Convert.ToString(_values.Items[e.Index], System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
            BeginInvoke(() =>
            {
                if (e.NewValue == CheckState.Checked) _checkedValues.Add(value);
                else _checkedValues.Remove(value);
                UpdateSelectAllState();
            });
        };
        _selectAll.CheckedChanged += (_, _) => ToggleAllVisible();
        clear.Click += (_, _) => { Applied?.Invoke(null); Close(); };
        cancel.Click += (_, _) => Close();
        apply.Click += (_, _) => { Applied?.Invoke(new HashSet<string>(_checkedValues, StringComparer.OrdinalIgnoreCase)); Close(); };
        RebuildValues();
    }

    public event Action<HashSet<string>?>? Applied;

    private void RebuildValues()
    {
        var search = _search.Text.Trim();
        _updating = true;
        _values.BeginUpdate();
        try
        {
            _values.Items.Clear();
            foreach (var value in _allValues.Where(value => string.IsNullOrWhiteSpace(search) || value.Contains(search, StringComparison.OrdinalIgnoreCase)))
            {
                _values.Items.Add(value, _checkedValues.Contains(value));
            }
        }
        finally
        {
            _values.EndUpdate();
            _updating = false;
        }
        UpdateSelectAllState();
    }

    private void ToggleAllVisible()
    {
        if (_updating) return;
        _updating = true;
        try
        {
            for (var index = 0; index < _values.Items.Count; index++)
            {
                var value = Convert.ToString(_values.Items[index], System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
                _values.SetItemChecked(index, _selectAll.Checked);
                if (_selectAll.Checked) _checkedValues.Add(value);
                else _checkedValues.Remove(value);
            }
        }
        finally
        {
            _updating = false;
        }
    }

    private void UpdateSelectAllState()
    {
        _updating = true;
        try
        {
            _selectAll.Checked = _values.Items.Count > 0 && _values.Items.Cast<string>().All(value => _checkedValues.Contains(value));
        }
        finally
        {
            _updating = false;
        }
    }

    private static Button CompactButton(string text)
    {
        var button = AppTheme.SecondaryButton(text, 62);
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
