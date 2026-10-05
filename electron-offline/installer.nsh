; Extra installer steps for ClickGroup POS Offline (electron-builder NSIS include).

!macro customInstall
  ; Waiter tablets reach this PC on port 4100. Windows often files a
  ; restaurant's Wi-Fi as a "Public" network, so the rule covers every profile.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="ClickGroup POS Offline"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="ClickGroup POS Offline" dir=in action=allow protocol=TCP localport=4100 profile=any'

  ; One data folder for every Windows user of this PC (database, pictures,
  ; backups), writable by all of them — S-1-5-32-545 is the Users group.
  ; With "all" users, $APPDATA is C:\ProgramData.
  SetShellVarContext all
  CreateDirectory "$APPDATA\ClickGroup POS Offline"
  nsExec::Exec 'icacls "$APPDATA\ClickGroup POS Offline" /grant *S-1-5-32-545:(OI)(CI)M /T /Q'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="ClickGroup POS Offline"'
  ; The data folder is kept on purpose: it holds the restaurant's sales.
!macroend
