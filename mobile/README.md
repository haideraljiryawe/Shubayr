# Shubayr — Mobile & Admin (Flutter)

One Flutter codebase for **Customer + Delivery + Admin**, also building for
**Flutter Web** (admin dashboard). Scaffolded with **Claude Code** using
`../prompts/MOBILE_CLAUDE_FULL.md`. See
`../docs/setup/SETUP_MOBILE.md` for complete environment setup.

## Run (after scaffolding)
```bash
flutter pub get
flutter run                        # device/emulator (customer/delivery)
flutter run -d chrome              # admin web dashboard
```

Set the API base URL via `--dart-define=API_URL=http://localhost:8000/api/v1`.
Branding is white-label, loaded at startup from `store_settings`.
