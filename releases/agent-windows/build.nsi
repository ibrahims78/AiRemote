Unicode True
Name "AiRemote Agent v1.3.0"
OutFile "AiRemote-Agent-v1.3.0-Windows-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\AiRemote-Agent"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SilentInstall silent

Section "Portable"
    SetOutPath "$INSTDIR"
    File /r "win-unpacked\*.*"
    ExecShell "" "$INSTDIR\electron.exe"
SectionEnd
