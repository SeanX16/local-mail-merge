using System.Reflection;

namespace LocalMailMerge.App;

internal static class OutlookLateBinding
{
    public static object InvokeRequired(object target, string name, params object?[] arguments) =>
        target.GetType().InvokeMember(name, BindingFlags.InvokeMethod, null, target, arguments)
        ?? throw new InvalidOperationException($"Outlook 操作失败：{name}");

    public static void InvokeVoid(object target, string name, params object?[] arguments) =>
        target.GetType().InvokeMember(name, BindingFlags.InvokeMethod, null, target, arguments);
}
