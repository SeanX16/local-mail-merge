[CmdletBinding()]
param(
    [string]$ConfigPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptDirectory)) {
    $scriptDirectory = (Get-Location).Path
}
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $scriptDirectory "config.json"
}

function Get-TestConfig {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing config file: $Path. Copy config.example.json to config.json and set test_recipient first."
    }

    $config = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json
    $recipient = [string]$config.test_recipient
    if ([string]::IsNullOrWhiteSpace($recipient) -or
        $recipient -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' -or
        $recipient -like '*.example') {
        throw "test_recipient must be your real company test address, not the example placeholder."
    }
    return $config
}

function ConvertTo-WrappedBase64 {
    param([string]$Text)

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $base64 = [Convert]::ToBase64String($bytes)
    $parts = for ($offset = 0; $offset -lt $base64.Length; $offset += 76) {
        $length = [Math]::Min(76, $base64.Length - $offset)
        $base64.Substring($offset, $length)
    }
    return ($parts -join "`r`n")
}

$config = Get-TestConfig -Path $ConfigPath
$recipient = [string]$config.test_recipient
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$subjectText = "[Compatibility Test - DO NOT SEND] AI for HR EML $timestamp"
$subjectEncoded = "=?UTF-8?B?$([Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($subjectText)))?="

$htmlBody = @"
<!doctype html>
<html>
<body>
  <p><strong>这是一封兼容性测试邮件，请勿发送。</strong></p>
  <p>This is an AI for HR email-delivery compatibility test. Do not send.</p>
  <p>用于检查：中文、English、换行、<strong>粗体</strong>和
     <a href="https://example.com/compatibility-test">链接</a>。</p>
  <p>Generated locally at: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</p>
</body>
</html>
"@

$headers = @(
    "To: $recipient",
    "Subject: $subjectEncoded",
    "Date: $([DateTime]::Now.ToString('ddd, dd MMM yyyy HH:mm:ss zzz', [Globalization.CultureInfo]::InvariantCulture))",
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "X-Unsent: 1",
    "X-AI-for-HR-Test: eml-compatibility"
)

$emlContent = ($headers -join "`r`n") + "`r`n`r`n" + (ConvertTo-WrappedBase64 -Text $htmlBody) + "`r`n"
$outputDir = Join-Path $scriptDirectory "generated"
[System.IO.Directory]::CreateDirectory($outputDir) | Out-Null
$outputPath = Join-Path $outputDir "compatibility_test_$timestamp.eml"
$ascii = New-Object System.Text.ASCIIEncoding
[System.IO.File]::WriteAllText($outputPath, $emlContent, $ascii)

Write-Host "EML test file created:" -ForegroundColor Green
Write-Host $outputPath
Write-Host "Double-click it. Do not click Send. Check whether Outlook opens it as an editable unsent message."
