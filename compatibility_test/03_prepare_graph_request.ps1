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

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
    throw "Missing config file: $ConfigPath. Copy config.example.json to config.json and set test_recipient first."
}

$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $ConfigPath | ConvertFrom-Json
$recipient = [string]$config.test_recipient
if ([string]::IsNullOrWhiteSpace($recipient) -or
    $recipient -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' -or
    $recipient -like '*.example') {
    throw "test_recipient must be your real company test address, not the example placeholder."
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$payload = [ordered]@{
    subject = "[Compatibility Test - DO NOT SEND] AI for HR Graph $timestamp"
    body = [ordered]@{
        contentType = "HTML"
        content = "<p><strong>这是一封 Microsoft Graph 兼容性测试草稿，请勿发送。</strong></p><p>This draft tests Chinese, English, line breaks, <strong>bold text</strong>, and <a href=`"https://example.com/compatibility-test`">a link</a>.</p><p>Prepared at: $timestamp</p>"
    }
    toRecipients = @(
        [ordered]@{
            emailAddress = [ordered]@{
                address = $recipient
            }
        }
    )
}

$outputPath = Join-Path $scriptDirectory "graph_request.ready.json"
$json = $payload | ConvertTo-Json -Depth 8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json, $utf8NoBom)

Write-Host "Graph draft request prepared:" -ForegroundColor Green
Write-Host $outputPath
Write-Host "Endpoint: POST https://graph.microsoft.com/v1.0/me/messages"
Write-Host "Paste the JSON into Microsoft Graph Explorer. This endpoint creates a draft; it does not send it."
