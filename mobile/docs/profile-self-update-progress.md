# B3a — Own profile name and email

Implemented 2026-09-10 with mock and remote repositories. Technical checks passed;
Ahmed confirmed manual acceptance on 2026-09-10. B3a is complete within its stated
mock/client scope; live-backend integration remains pending.

## Contract and behavior

- `PATCH /me` uses `UserSelfUpdate`: at least one property, no extra properties.
  Name is trimmed, nonblank and at most 120 characters. Email is optional,
  validated and at most 160 characters; an explicit `null` clears it.
- Only changed fields are sent. Updating email alone does not require entering a
  previously absent name. An unchanged email is omitted rather than cleared.
- `User` now decodes/encodes nullable email, including older responses without it.
  Session comparison includes email so email-only edits notify consumers.
- The session adopts the returned user only after successful saving. Pending or
  failed writes leave the current profile intact. Late successes and failures
  after logout, another login or disposal cannot overwrite/reopen the session.
- The profile form keeps drafts on failure and supports retry, local validation,
  disabled editing while saving and authoritative server values after success.
  It uses the shared responsive form layout, translations and theme.
- Mock profiles are isolated by phone and retained in the auth repository during
  its lifetime, including GET /me and signing back into the same mock account.
  This is in-memory storage: restarting the application/recreating the repository
  resets mock data. Permanent storage requires the backend; no local data
  migration or unrequested storage layer was introduced.
- Phone, role and permissions cannot be written through this operation. Profile
  photo/deletion remain B3b; changing a phone still needs its own verified flow.

## Main files

- `lib/features/auth/domain/profile_update.dart`: typed partial input/validation.
- `lib/features/auth/domain/auth_repository.dart` and both auth repositories:
  self-update operation, mock persistence and remote PATCH.
- `lib/features/auth/data/user.dart` / generated mapper and `domain/session.dart`:
  email parsing and session notifications.
- `lib/features/auth/presentation/providers/auth_providers.dart`: success-only
  session update and stale-response protection.
- `lib/features/settings/presentation/screens/profile_screen.dart`: responsive
  name/email form, validation, saving and retry.
- Arabic/English localization sources and generated localization files.
- Repository/session/widget tests under `test/features/auth/` and
  `test/features/settings/`.

## Verification

- Generated the user mapper and localizations; formatted changed Dart files.
- `flutter analyze`: no issues.
- Focused profile tests: **21 passed**.
- Complete `flutter test`: **384 passed**.
- `flutter build web --dart-define=DATA_SOURCE=mock`: succeeded.
- Coverage: partial payloads, null clearing, limits, 401/422 mapping, mock account
  isolation, GET/relogin persistence, delayed saves, failure/retry, response
  normalization, logout/login/disposal races and email-only changes.
- Profile tests cover Arabic/English, both themes, 2x text and resizing across
  390/599/600/899/900/1199/1200/1535/1536/1920. The full responsive suite also
  covers the existing operational screens at their previously documented sizes.
- No live backend or Simulator/Emulator was used. Commit/push is handled separately after Ahmed’s explicit request.

## Manual acceptance

1. With `DATA_SOURCE=mock`, sign in, open Account → Profile, edit name/email and
   save. Reopen the profile and verify both values remain; check the account name.
2. Edit only email, then clear it and save: the name must remain intact. Enter an
   invalid email: validation must prevent saving. Sign out and back in with the
   same phone during this run and confirm the saved profile is restored.
3. Switch language/theme and resize phone/tablet/desktop: fields should stack or
   sit side by side as space permits, without losing input or hiding actions.

Network/422 failure and retry are covered by tests; mock mode does not expose a
new failure-injection control in the customer UI.
