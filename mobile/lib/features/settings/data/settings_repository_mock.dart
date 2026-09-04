import '../domain/settings_repository.dart';
import 'store_settings.dart';

/// Mock white-label settings.
///
/// The shape is taken verbatim from the `StoreSettings` schema in
/// `api/openapi.yaml`; no field is invented. `primary_color` is deliberately
/// left null so mock runs exercise the bundled brand fallback path.
class SettingsRepositoryMock implements SettingsRepository {
  const SettingsRepositoryMock({
    this.delay = const Duration(milliseconds: 250),
  });

  final Duration delay;

  @override
  Future<StoreSettings> fetch() async {
    await Future<void>.delayed(delay);
    return const StoreSettings(currency: 'IQD');
  }
}
