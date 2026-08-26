#ifndef AppVersion
  #error AppVersion must be supplied by the build script.
#endif

#ifndef SourceDir
  #error SourceDir must be supplied by the build script.
#endif

#ifndef OutputDir
  #error OutputDir must be supplied by the build script.
#endif

#define AppName "Local Mail Merge"
#define AppExeName "LocalMailMerge.exe"

[Setup]
AppId={{F1867A97-7361-49F5-B09E-BF6F915D2A8A}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} v{#AppVersion}
AppPublisher=Sean
AppPublisherURL=https://github.com/SeanX16/local-mail-merge
AppSupportURL=https://github.com/SeanX16/local-mail-merge/issues
AppUpdatesURL=https://github.com/SeanX16/local-mail-merge/releases
AppCopyright=Copyright © 2026 Sean.
VersionInfoVersion={#AppVersion}
VersionInfoCompany=Sean
VersionInfoDescription={#AppName} 安装程序
VersionInfoCopyright=Copyright © 2026 Sean.
DefaultDirName={autopf}\{#AppName}
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=yes
DisableReadyPage=no
DisableFinishedPage=no
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#OutputDir}
OutputBaseFilename=Local-Mail-Merge-v{#AppVersion}-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
SetupLogging=yes
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\{#AppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
LicenseFile=..\..\..\LICENSE
UsePreviousAppDir=yes
UsePreviousTasks=yes

[Languages]
Name: "chinesesimp"; MessagesFile: ".\third-party\inno-setup-chinese-simplified\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startmenuicon"; Description: "创建开始菜单快捷方式"; GroupDescription: "快捷方式："
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: startmenuicon
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "启动 {#AppName}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
