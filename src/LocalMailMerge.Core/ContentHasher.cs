using System.Security.Cryptography;
using System.Text;

namespace LocalMailMerge.Core;

public static class ContentHasher
{
    public static string Compute(OutreachMessage message)
    {
        var body = !string.IsNullOrWhiteSpace(message.BodyHtml)
            ? Normalize(message.BodyHtml)
            : Normalize(message.BodyText);

        var canonical = string.Join("\n", new[]
        {
            message.RecipientEmail.Trim().ToLowerInvariant(),
            Normalize(message.Subject),
            body
        });

        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        return $"sha256:{Convert.ToHexStringLower(digest)}";
    }

    public static string BuildDeduplicationKey(string batchId, string personId, string contentHash) =>
        string.Join("|", batchId.Trim(), personId.Trim(), contentHash.Trim().ToLowerInvariant());

    private static string Normalize(string value) =>
        value.Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Trim();
}
