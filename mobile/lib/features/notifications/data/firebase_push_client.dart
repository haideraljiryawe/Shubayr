import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../domain/push_client.dart';

/// Firebase client identifiers are supplied per platform by an external build
/// file. Empty means unconfigured; never generate a sample project identifier.
FirebaseOptions? firebaseOptionsFromEnvironment() {
  const key = String.fromEnvironment('FIREBASE_API_KEY');
  const app = String.fromEnvironment('FIREBASE_APP_ID');
  const sender = String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  const project = String.fromEnvironment('FIREBASE_PROJECT_ID');
  if ([key, app, sender, project].any((s) => s.trim().isEmpty)) return null;
  return const FirebaseOptions(
    apiKey: key,
    appId: app,
    messagingSenderId: sender,
    projectId: project,
    iosBundleId: 'com.shubayr.app',
  );
}

@pragma('vm:entry-point')
Future<void> firebaseBackgroundMessage(RemoteMessage message) async {
  final options = firebaseOptionsFromEnvironment();
  if (options == null) return;
  await Firebase.initializeApp(options: options);
  // The OS presents notification payloads. Never navigate, expose payloads,
  // or mutate account state from a background isolate. Resume refreshes inbox.
}

Future<PushClient?> createFirebasePushClient() async {
  if (kIsWeb ||
      (defaultTargetPlatform != TargetPlatform.android &&
          defaultTargetPlatform != TargetPlatform.iOS)) {
    return null;
  }
  final options = firebaseOptionsFromEnvironment();
  if (options == null) return null;
  await Firebase.initializeApp(options: options);
  FirebaseMessaging.onBackgroundMessage(firebaseBackgroundMessage);
  return FirebasePushClient(FirebaseMessaging.instance);
}

class FirebasePushClient implements PushClient {
  FirebasePushClient(this._messaging);
  final FirebaseMessaging _messaging;
  @override
  String get platform =>
      defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  @override
  Future<PushPermission> permission({bool request = false}) async {
    final settings = request
        ? await _messaging.requestPermission(
            alert: true,
            badge: true,
            sound: true,
          )
        : await _messaging.getNotificationSettings();
    return switch (settings.authorizationStatus) {
      AuthorizationStatus.authorized ||
      AuthorizationStatus.provisional => PushPermission.authorized,
      AuthorizationStatus.denied ||
      AuthorizationStatus.deniedPermanently => PushPermission.denied,
      AuthorizationStatus.notDetermined => PushPermission.notDetermined,
    };
  }

  @override
  Future<String?> token() async {
    // Apple requires APNs registration before FCM token APIs. Retry on resume
    // and token refresh if APNs has not finished yet; never synthesize a token.
    if (platform == 'ios' && await _messaging.getAPNSToken() == null) {
      return null;
    }
    await _messaging.setAutoInitEnabled(true);
    return _messaging.getToken();
  }

  @override
  Future<void> resetToken() async {
    await _messaging.setAutoInitEnabled(false);
    await _messaging.deleteToken();
  }

  @override
  Stream<String> get tokenChanges => _messaging.onTokenRefresh;
  @override
  Stream<PushEvent> get events => Stream.multi((sink) {
    final foreground = FirebaseMessaging.onMessage.listen(
      (_) => sink.add(PushEvent.foreground),
      onError: sink.addError,
    );
    final opened = FirebaseMessaging.onMessageOpenedApp.listen(
      (_) => sink.add(PushEvent.opened),
      onError: sink.addError,
    );
    sink.onCancel = () async {
      await foreground.cancel();
      await opened.cancel();
    };
  });
  @override
  Future<bool> initiallyOpened() async =>
      await _messaging.getInitialMessage() != null;
}
