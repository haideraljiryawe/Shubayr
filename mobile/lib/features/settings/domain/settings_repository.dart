import '../data/store_settings.dart';

/// White-label settings source. Implemented by a mock and a Dio repository;
/// presentation code only ever sees this interface.
abstract interface class SettingsRepository {
  /// `GET /settings` — public, so it can be fetched before sign-in.
  Future<StoreSettings> fetch();
}
