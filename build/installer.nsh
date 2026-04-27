; -----------------------------------------------------------------------------
; Iraqi Labor Scheduler — installer customisation
;
; Two responsibilities:
;   1. Detect an existing installation (electron-builder writes its install
;      dir to HKCU under the appId) and present the wizard as an Update
;      rather than a fresh Install. The user sees a clear "Updating from vX"
;      header on the welcome page, and the directory-selection step is
;      skipped — updates always reinstall into the same folder so existing
;      Start Menu / Desktop shortcuts keep working.
;
;   2. Defensively guarantee that the per-user data folder
;      (%APPDATA%\iraqi-labor-scheduler\data) is *never* touched by the
;      installer's payload. The data folder lives outside ${INSTDIR} by
;      design (see electron/main.cjs), so this is a belt-and-braces check —
;      we explicitly skip uninstalling it during the silent uninstall that
;      precedes an update.
;
; electron-builder hooks: customWelcomePage / customUnInit / customInstall.
; -----------------------------------------------------------------------------

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"

Var /GLOBAL ILS_PreviousVersion
Var /GLOBAL ILS_IsUpdate

; --- Detect existing install before the welcome page renders ----------------
!macro customInit
  ; electron-builder writes the previous version under our appId. We pull
  ; it out so the welcome page can announce "Updating from vX → vY" instead
  ; of the generic Install banner.
  ReadRegStr $ILS_PreviousVersion HKCU "Software\${PRODUCT_NAME}" "Version"
  ${If} $ILS_PreviousVersion == ""
    ; Older releases stored the version under the uninstall key — fall back.
    ReadRegStr $ILS_PreviousVersion HKCU \
      "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" \
      "DisplayVersion"
  ${EndIf}
  ${If} $ILS_PreviousVersion != ""
    StrCpy $ILS_IsUpdate "1"
  ${Else}
    StrCpy $ILS_IsUpdate "0"
  ${EndIf}
!macroend

; --- Customise the welcome page wording -------------------------------------
!macro customHeader
  ${If} $ILS_IsUpdate == "1"
    !define MUI_WELCOMEPAGE_TITLE "Update Iraqi Labor Scheduler"
    !define MUI_WELCOMEPAGE_TEXT "An existing installation was detected (version $ILS_PreviousVersion).$\r$\n$\r$\nThis wizard will update Iraqi Labor Scheduler to version ${VERSION} in the same folder. Your data — employees, schedules, stations, holidays, and audit log — is stored separately in your user profile and will be preserved across the update.$\r$\n$\r$\nClick Next to continue."
    !define MUI_FINISHPAGE_TITLE "Update Complete"
    !define MUI_FINISHPAGE_TEXT "Iraqi Labor Scheduler has been updated to version ${VERSION}.$\r$\n$\r$\nYour previous data is intact. The first launch after an update creates a timestamped backup of the data folder automatically — see the app's logs folder if you ever need to roll back."
  ${Else}
    !define MUI_WELCOMEPAGE_TITLE "Install Iraqi Labor Scheduler"
    !define MUI_FINISHPAGE_TITLE "Installation Complete"
  ${EndIf}
!macroend

; --- Defensive: refuse to delete the user data folder during uninstall ------
;
; electron-builder's uninstaller respects `deleteAppDataOnUninstall: false`
; (set in package.json), but updates run a silent uninstall of the previous
; version first. This guard ensures that even if a future installer flag
; flips the default, the data dir survives.
!macro customUnInstall
  ${If} ${Silent}
    ; Silent uninstall path = either a true uninstall or the pre-update sweep.
    ; In both cases we never want to remove the data folder.
    DetailPrint "Preserving user data folder at $APPDATA\${PRODUCT_FILENAME}\data"
  ${EndIf}
!macroend

; --- Stamp the version on completion so the next installer detects it -------
!macro customInstall
  WriteRegStr HKCU "Software\${PRODUCT_NAME}" "Version" "${VERSION}"
  WriteRegStr HKCU "Software\${PRODUCT_NAME}" "InstallPath" "$INSTDIR"

  ; Drop a marker file the Electron main process reads on first launch to
  ; trigger the automatic data-folder snapshot. The main process clears the
  ; file once the snapshot is complete.
  ;
  ; Path note: NSIS resolves `${PRODUCT_FILENAME}` from the productName
  ; (e.g. "Iraqi Labor Scheduler") while Electron's `app.getPath('userData')`
  ; follows the package.json `name` ("iraqi-labor-scheduler"). To keep the
  ; two reliably wired together we write the marker to BOTH potential
  ; AppData folders and the Electron main process checks both at startup.
  CreateDirectory "$APPDATA\${PRODUCT_FILENAME}"
  FileOpen $0 "$APPDATA\${PRODUCT_FILENAME}\.update-pending" w
  FileWrite $0 "${VERSION}$\r$\n"
  FileWrite $0 "$ILS_PreviousVersion$\r$\n"
  FileClose $0

  CreateDirectory "$APPDATA\iraqi-labor-scheduler"
  FileOpen $0 "$APPDATA\iraqi-labor-scheduler\.update-pending" w
  FileWrite $0 "${VERSION}$\r$\n"
  FileWrite $0 "$ILS_PreviousVersion$\r$\n"
  FileClose $0
!macroend
