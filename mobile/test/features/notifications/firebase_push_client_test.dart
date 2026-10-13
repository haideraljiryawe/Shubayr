import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/notifications/data/firebase_push_client.dart';
import 'package:shubayr/features/notifications/domain/push_client.dart';
import 'package:shubayr/features/notifications/domain/push_lifecycle.dart';

class _Settings extends Fake implements NotificationSettings {
  _Settings(this.authorizationStatus);
  @override
  final AuthorizationStatus authorizationStatus;
}

class _Messaging extends Fake implements FirebaseMessaging {
  final calls = <String>[];
  AuthorizationStatus authorization = AuthorizationStatus.authorized;
  bool autoInit = false, apnsReady = false;
  Completer<void>? enabling;
  final enableStarted = Completer<void>();

  @override
  Future<NotificationSettings> getNotificationSettings() async {
    calls.add('permission');
    return _Settings(authorization);
  }

  @override
  Future<NotificationSettings> requestPermission({
    bool alert = true,
    bool announcement = false,
    bool badge = true,
    bool carPlay = false,
    bool criticalAlert = false,
    bool provisional = false,
    bool sound = true,
    bool providesAppNotificationSettings = false,
  }) async {
    calls.add('request');
    authorization = AuthorizationStatus.authorized;
    return _Settings(authorization);
  }

  @override
  Future<void> setAutoInitEnabled(bool enabled) async {
    calls.add('autoInit:$enabled');
    if (enabled) {
      if (!enableStarted.isCompleted) enableStarted.complete();
      await enabling?.future;
    }
    autoInit = enabled;
  }

  @override
  Future<String?> getAPNSToken() async {
    calls.add('apns');
    // Model the plugin's deferred APNs registration while auto-init is off.
    return autoInit && apnsReady ? 'test-apns' : null;
  }

  @override
  Future<String?> getToken({
    String? vapidKey,
    String? serviceWorkerScriptPath,
  }) async {
    calls.add('token');
    if (defaultTargetPlatform == TargetPlatform.iOS && !apnsReady) {
      throw StateError('APNs is not ready');
    }
    return 'test-fcm';
  }

  @override
  Future<void> deleteToken() async => calls.add('delete');
  @override
  Stream<String> get onTokenRefresh => const Stream.empty();
  @override
  Future<RemoteMessage?> getInitialMessage() async => null;
}

class _Devices extends Fake implements DeviceRegistration {
  final calls = <String>[];
  @override
  Future<void> register(
    String token,
    String platform,
    String locale,
    int revision,
  ) async => calls.add('register:$platform:$locale:$revision');
  @override
  Future<void> unregister(String token, int revision) async =>
      calls.add('unregister:$revision');
}

const _customer = (userId: 'customer', revision: 1, locale: 'ar');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Messaging messaging;
  late _Devices devices;
  late PushLifecycle lifecycle;

  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    messaging = _Messaging();
    devices = _Devices();
    lifecycle = PushLifecycle(
      createClient: () async => FirebasePushClient(messaging),
      devices: devices,
      report: (_, _) {},
      onEvent: (_, _) {},
    );
  });
  tearDown(() {
    lifecycle.dispose();
    debugDefaultTargetPlatformOverride = null;
  });

  test('iOS starts APNs registration before checking for its token', () async {
    messaging.apnsReady = true;
    expect(await lifecycle.synchronize(_customer), PushPermission.authorized);
    expect(messaging.calls, ['permission', 'autoInit:true', 'apns', 'token']);
    expect(devices.calls, ['register:ios:ar:1']);
  });
  for (final platform in [TargetPlatform.iOS, TargetPlatform.android]) {
    for (final status in AuthorizationStatus.values) {
      test(
        '$platform initial request only for native notDetermined: $status',
        () async {
          debugDefaultTargetPlatformOverride = platform;
          messaging.authorization = status;
          messaging.apnsReady = true;
          await lifecycle.synchronize(_customer, requestPermission: true);
          expect(
            messaging.calls.where((c) => c == 'request').length,
            status == AuthorizationStatus.notDetermined ? 1 : 0,
          );
          expect(
            devices.calls.length,
            status == AuthorizationStatus.denied ||
                    status == AuthorizationStatus.deniedPermanently
                ? 0
                : 1,
          );
        },
      );
    }
  }

  test('pending APNs skips FCM token retrieval and can retry', () async {
    expect(
      await lifecycle.synchronize(_customer),
      PushPermission.notDetermined,
    );
    expect(messaging.autoInit, isTrue);
    expect(messaging.calls, ['permission', 'autoInit:true', 'apns']);
    expect(devices.calls, isEmpty);

    messaging.apnsReady = true;
    expect(await lifecycle.synchronize(_customer), PushPermission.authorized);
    expect(devices.calls, ['register:ios:ar:1']);
  });

  test('no customer or authorization never enables token generation', () async {
    expect(await lifecycle.synchronize(null), PushPermission.unavailable);
    expect(messaging.calls, isEmpty);
    for (final status in [
      AuthorizationStatus.notDetermined,
      AuthorizationStatus.denied,
      AuthorizationStatus.deniedPermanently,
    ]) {
      messaging.authorization = status;
      await lifecycle.synchronize(_customer);
    }
    expect(messaging.calls, ['permission', 'permission', 'permission']);
    expect(messaging.autoInit, isFalse);
    expect(devices.calls, isEmpty);
  });

  test('logout disables auto-init and deletes the registered token', () async {
    messaging.apnsReady = true;
    await lifecycle.synchronize(_customer);
    await lifecycle.endSession(2);
    expect(messaging.autoInit, isFalse);
    expect(messaging.calls.sublist(messaging.calls.length - 2), [
      'autoInit:false',
      'delete',
    ]);
    expect(devices.calls, ['register:ios:ar:1', 'unregister:2']);
  });

  test('logout while APNs is pending still disables auto-init', () async {
    await lifecycle.synchronize(_customer);
    await lifecycle.endSession(2);
    expect(messaging.autoInit, isFalse);
    expect(messaging.calls, [
      'permission',
      'autoInit:true',
      'apns',
      'autoInit:false',
      'delete',
    ]);
    expect(devices.calls, isEmpty);
  });

  test('logout during initialization prevents stale registration', () async {
    messaging.apnsReady = true;
    final gate = messaging.enabling = Completer<void>();
    final sync = lifecycle.synchronize(_customer);
    await messaging.enableStarted.future;
    final logout = lifecycle.endSession(2);
    gate.complete();
    expect(await sync, PushPermission.unavailable);
    await logout;
    expect(messaging.autoInit, isFalse);
    expect(messaging.calls.last, 'delete');
    expect(devices.calls, isEmpty);
  });

  test('Android still gets its FCM token without checking APNs', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(await lifecycle.synchronize(_customer), PushPermission.authorized);
    expect(messaging.calls, ['permission', 'autoInit:true', 'token']);
    expect(devices.calls, ['register:android:ar:1']);
  });
}
