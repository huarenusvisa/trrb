# 唐人日报 macOS

Native SwiftUI desktop application, macOS 13+, universal arm64/x86_64.
Shares the production public article APIs; Mac-only local bookmarks are clearly labeled.
Service portals retain existing website login flows. No embedded account secrets.

## Build

On a Mac with Xcode and XcodeGen:

```
python3 scripts/macos/icons.py
xcodegen generate --spec apps/macos/project.yml
xcodebuild -project apps/macos/TangDailyMac.xcodeproj -scheme TangDailyMac -configuration Release CODE_SIGNING_ALLOWED=NO build
```

The isolated `Tang Daily macOS Release` workflow compiles both architectures,
launches the actual app for screenshot evidence, checks the submission key already
assigned to this Expo project, and attempts an automatically provisioned Mac archive.
Private keys remain only in ephemeral runner storage and are excluded from artifacts.
Uploading requires the explicit upload input after visual validation. iOS release
configuration is not changed by this workflow.

Bundle identifier: com.tangrenribao.iosapp; team: ZJ2LNXPXH3.
Store version: 1.0. Existing iOS 1.1.1 submission is separate.
