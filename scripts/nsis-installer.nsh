!macro customInstall
  ${ifNot} ${isUpdated}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "POS Ticket Bridge" "$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" --background"
  ${endIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "POS Ticket Bridge"
  ${endIf}
!macroend

