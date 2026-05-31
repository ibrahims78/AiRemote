Unicode True
Name "AiRemote Agent v1.4.0"
OutFile "AiRemote-Agent-v1.4.0-Windows-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\AiRemote-Agent"
RequestExecutionLevel user
SetCompressor /SOLID lzma

Section "Portable"
    SetOutPath "$INSTDIR"
    File /r "win-unpacked\*.*"
    ExecShell "" "$INSTDIR\AiRemote Agent.exe"
SectionEnd
