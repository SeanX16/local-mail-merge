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

$config = Get-TestConfig -Path $ConfigPath
$recipient = [string]$config.test_recipient
$openAfterCreate = $true
if ($null -ne $config.open_outlook_draft_after_create) {
    $openAfterCreate = [bool]$config.open_outlook_draft_after_create
}

Write-Host "This test will create ONE Outlook draft addressed to:" -ForegroundColor Yellow
Write-Host $recipient
Write-Host "It does not call Outlook's Send method."
$confirmation = Read-Host "Type CREATE DRAFT to continue"
if ($confirmation -cne "CREATE DRAFT") {
    Write-Host "Cancelled. No Outlook item was created."
    exit 0
}

$outlook = $null
$mail = $null
try {
    $outlook = New-Object -ComObject Outlook.Application
    $mail = $outlook.CreateItem(0)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    $mail.To = $recipient
    $mail.Subject = "[Compatibility Test - DO NOT SEND] AI for HR Outlook local $timestamp"
    $mail.BodyFormat = 2
    $mail.HTMLBody = @"
<html>
<body>
  <p><strong>这是一封 Outlook 本地自动化兼容性测试草稿，请勿发送。</strong></p>
  <p>This draft was created through the locally installed classic Outlook application.</p>
  <p>用于检查：中文、English、换行、<strong>粗体</strong>和
     <a href="https://example.com/compatibility-test">链接</a>。</p>
  <p>Created locally at: $timestamp</p>
</body>
</html>
"@

    $mail.Save()
    $entryId = [string]$mail.EntryID

    if ($openAfterCreate) {
        $mail.Display()
    }

    Write-Host "Outlook draft created successfully." -ForegroundColor Green
    Write-Host "Entry ID: $entryId"
    Write-Host "Check the Drafts folder, editability, Chinese text, formatting, and persistence after restarting Outlook."
    Write-Host "Do not click Send."
}
catch {
    Write-Error ("Outlook local automation failed: " + $_.Exception.Message)
    exit 1
}
