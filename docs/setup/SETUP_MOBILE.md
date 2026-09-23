# Mobile setup - Ahmed

You own `mobile/`, the Flutter mobile app only.

## 1. Prerequisites

| OS | Required tools |
|---|---|
| macOS | Git, Flutter stable, Android Studio, and Xcode for iOS builds |
| Windows | Git for Windows, Flutter stable, and Android Studio; iOS builds require macOS |
| Linux | Git, Flutter stable, Android Studio, and the Android SDK |

Verify:

```bash
git --version
flutter --version
flutter doctor
```

## 2. Clone and install packages

```bash
git clone https://github.com/haideraljiryawe/Shubayr.git
cd Shubayr
git switch main
git pull --ff-only origin main
git switch -c feature/mobile-<change>
```

Open a pull request into `main` when the work is ready; delete the feature branch
after it merges.

Follow the [authoritative mobile build prompt](../../prompts/MOBILE_CLAUDE_FULL.md).
After `pubspec.yaml` exists:

```bash
cd mobile
flutter pub get
flutter devices
```

## 3. Select the correct API URL

Android emulator (the host machine is `10.0.2.2`):

```bash
flutter run --dart-define=API_URL=http://10.0.2.2:8000/api/v1 --dart-define=DATA_SOURCE=remote
```

iOS Simulator or desktop target:

```bash
flutter run --dart-define=API_URL=http://localhost:8000/api/v1 --dart-define=DATA_SOURCE=remote
```

Physical device: replace `<YOUR-LAN-IP>` with the development machine's LAN IP
and ensure the firewall permits port 8000:

```bash
flutter run --dart-define=API_URL=http://<YOUR-LAN-IP>:8000/api/v1 --dart-define=DATA_SOURCE=remote
```

Flutter Web:

```bash
flutter run -d chrome --dart-define=API_URL=http://localhost:8000/api/v1 --dart-define=DATA_SOURCE=remote
```

## 4. Work before the backend is live

Use [the OpenAPI contract](../../api/openapi.yaml) as the only source for paths,
payloads, status codes, and authentication. Create contract-shaped mock
repositories/fixtures for success, validation, authentication, empty, and error
states. Do not invent endpoints; coordinate required contract changes with Abbas.

When the local backend is needed, follow [the backend setup guide](SETUP_BACKEND.md)
from the repository root. The default host API is
`http://localhost:8000/api/v1`. With `DATA_SOURCE=remote`, mocks are off. Use a
seeded phone from the backend setup guide and development OTP `000000` unless
it was overridden.
