# Local iOS device signing

Keep each developer's signing team out of the shared Xcode project. Debug,
Release, and Profile builds optionally load `ios/Flutter/LocalSigning.xcconfig`
(Profile uses Release.xcconfig). This file is ignored by Git.

For a real iPhone, create the local file with your own Apple Developer Team ID:

```xcconfig
DEVELOPMENT_TEAM = YOUR_TEAM_ID
```

Use the Apple account and certificates already configured in Xcode. This file
only selects a team; it does not create certificates, provision devices, or grant
account access. Simulator builds do not require a local signing team.

Avoid committing a personal `DEVELOPMENT_TEAM` value that Xcode may write back
into `Runner.xcodeproj/project.pbxproj` after changing Signing & Capabilities.
Keep that value in the local file instead. CI may supply its own local file or
an explicit `DEVELOPMENT_TEAM` build-setting override when signing is required.

To inspect the effective setting without building or installing the app:

```sh
cd ios
xcodebuild -project Runner.xcodeproj -target Runner -configuration Debug -showBuildSettings
```

Check `DEVELOPMENT_TEAM` in the output; repeat for Release and Profile as needed.

This uses Xcode's standard optional configuration-file includes:
[Apple's xcconfig format](https://help.apple.com/xcode/mac/current/en.lproj/dev745c5c974.html).
