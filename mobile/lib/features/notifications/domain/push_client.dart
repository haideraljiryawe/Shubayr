/// FCM integration is optional until genuine external client configuration exists.
/// No privileged credentials belong in this interface or in the app bundle.
enum PushPermission { authorized, denied, notDetermined, unavailable }

enum PushEvent { foreground, opened }

abstract interface class PushClient {
  Future<PushPermission> permission({bool request = false});
  Future<String?> token();
  Future<void> resetToken();
  Stream<String> get tokenChanges;
  Stream<PushEvent> get events;
  Future<bool> initiallyOpened();
  String get platform;
}

abstract interface class DeviceRegistration {
  Future<void> register(
    String token,
    String platform,
    String locale,
    int revision,
  );
  Future<void> unregister(String token, int revision);
}
