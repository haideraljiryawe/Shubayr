import '../../../core/network/api_client.dart';
import '../../../core/error/failure.dart';
import '../domain/push_client.dart';

class DeviceRegistrationRemote implements DeviceRegistration {
  const DeviceRegistrationRemote(this.api);
  final ApiClient api;
  @override
  Future<void> register(
    String token,
    String platform,
    String locale,
    int revision,
  ) async {
    await api.post<Map<String, dynamic>>(
      '/devices/token',
      body: {'token': token, 'platform': platform, 'locale': locale},
      sessionRevision: revision,
    );
  }

  @override
  Future<void> unregister(String token, int revision) async {
    try {
      await api.deleteVoid(
        '/devices/token',
        body: {'token': token},
        sessionRevision: revision,
      );
    } on AppFailure catch (error) {
      // A deleted/deactivated registration is already in the desired state.
      if (error.statusCode != 404) rethrow;
    }
  }
}
