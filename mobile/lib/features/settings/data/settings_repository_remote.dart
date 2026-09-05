import '../../../core/network/api_client.dart';
import '../domain/settings_repository.dart';
import 'store_settings.dart';

class SettingsRepositoryRemote implements SettingsRepository {
  const SettingsRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<StoreSettings> fetch() async {
    final json = await _api.get<Map<String, dynamic>>('/settings');
    return StoreSettings.fromJson(json);
  }
}
