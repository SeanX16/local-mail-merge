using System.Drawing.Drawing2D;

namespace LocalMailMerge.App;

internal static class AppTheme
{
    public static readonly Color Primary = Color.FromArgb(15, 91, 190);
    public static readonly Color PrimaryHover = Color.FromArgb(12, 75, 160);
    public static readonly Color Border = Color.FromArgb(218, 223, 230);
    public static readonly Color SurfaceMuted = Color.FromArgb(247, 249, 252);
    public static readonly Color TextPrimary = Color.FromArgb(31, 41, 55);
    public static readonly Color TextMuted = Color.FromArgb(96, 106, 120);
    public static readonly Color Success = Color.FromArgb(25, 135, 84);
    public static readonly Color Warning = Color.FromArgb(230, 126, 34);
    public static readonly Color Danger = Color.FromArgb(220, 53, 69);
    public static readonly Color Selection = Color.FromArgb(225, 240, 255);

    public static Button PrimaryButton(string text, int width = 170)
    {
        var button = new Button
        {
            Text = text,
            Width = width,
            Height = 42,
            FlatStyle = FlatStyle.Flat,
            BackColor = Primary,
            ForeColor = Color.White,
            Font = new Font("Microsoft YaHei UI", 8.6F, FontStyle.Bold),
            Cursor = Cursors.Hand,
            Margin = new Padding(8, 10, 8, 10)
        };
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = PrimaryHover;
        return button;
    }

    public static Button SecondaryButton(string text, int width = 112)
    {
        var button = new Button
        {
            Text = text,
            Width = width,
            Height = 36,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.White,
            ForeColor = TextPrimary,
            Font = new Font("Microsoft YaHei UI", 8F),
            Cursor = Cursors.Hand,
            Margin = new Padding(4)
        };
        button.FlatAppearance.BorderColor = Border;
        return button;
    }

    public static void Round(Control control, int radius = 8)
    {
        if (control.Width <= 0 || control.Height <= 0) return;
        using var path = new GraphicsPath();
        var diameter = radius * 2;
        path.AddArc(0, 0, diameter, diameter, 180, 90);
        path.AddArc(control.Width - diameter, 0, diameter, diameter, 270, 90);
        path.AddArc(control.Width - diameter, control.Height - diameter, diameter, diameter, 0, 90);
        path.AddArc(0, control.Height - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        control.Region = new Region(path);
    }
}
