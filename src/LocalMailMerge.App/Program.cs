namespace LocalMailMerge.App;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var renderIndex = Array.FindIndex(args, argument => argument.Equals("--render-preview", StringComparison.OrdinalIgnoreCase));
        var renderPath = renderIndex >= 0 && renderIndex + 1 < args.Length ? args[renderIndex + 1] : null;
        var demoMode = args.Any(argument => argument.Equals("--demo", StringComparison.OrdinalIgnoreCase)) || renderPath is not null;

        using var form = new MainForm(demoMode);
        if (renderPath is not null)
        {
            form.Shown += async (_, _) =>
            {
                try
                {
                    await form.LoadDemoAsync().ConfigureAwait(true);
                    await Task.Delay(800).ConfigureAwait(true);
                    form.CaptureTo(renderPath);
                }
                finally
                {
                    form.Close();
                }
            };
        }

        Application.Run(form);
    }
}
