# Code Signing Guide

Desktop app bundles require code signing for distribution outside developer mode.

## macOS

### Requirements
- Apple Developer account ($99/year)
- Developer ID Application certificate
- App-specific password for notarization

### Signing
```bash
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  "Cortex.app"

# Verify
codesign --verify --verbose "Cortex.app"
```

### Notarization
```bash
# Create zip for notarization
ditto -c -k --keepParent "Cortex.app" "Cortex.zip"

# Submit for notarization
xcrun notarytool submit "Cortex.zip" \
  --apple-id "your@email.com" \
  --team-id "TEAMID" \
  --password "@keychain:AC_PASSWORD" \
  --wait

# Staple ticket
xcrun stapler staple "Cortex.app"
```

### Env vars for CI
```
APPLE_DEVELOPER_ID=Developer ID Application: Your Name (TEAMID)
APPLE_NOTARY_USER=your@email.com
APPLE_NOTARY_PASSWORD=@keychain:AC_PASSWORD
APPLE_TEAM_ID=TEAMID
```

## Windows

### Requirements
- EV Code Signing Certificate (~$300-400/year) or OV Certificate (~$70/year)
- Hardware token or cloud HSM for EV certs

### Signing with signtool
```cmd
signtool sign /fd SHA256 ^
  /tr http://timestamp.digicert.com ^
  /td SHA256 ^
  /a ^
  "cortex.msi"
```

### Env vars for CI
```
WINDOWS_CERTIFICATE_BASE64=<base64 encoded .pfx>
WINDOWS_CERTIFICATE_PASSWORD=<pfx password>
```

## Tauri Build Configuration

In `desktop/src-tauri/tauri.conf.json`, set bundle signing:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAMID)"
    },
    "windows": {
      "certificateThumbprint": "A1B2C3D4E5F6...",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

## Without Code Signing

Without signing:
- **macOS**: Users must right-click → Open on first launch, or run `xattr -d com.apple.quarantine`
- **Windows**: SmartScreen may show "unrecognized app" warning, users can click "More info" → "Run anyway"
