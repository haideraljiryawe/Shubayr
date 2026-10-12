import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/network/interceptors/auth_interceptor.dart';
import 'package:shubayr/features/notifications/data/device_registration.dart';
import 'package:shubayr/features/notifications/domain/push_client.dart';
import 'package:shubayr/features/notifications/domain/push_lifecycle.dart';

class _Client implements PushClient {
  PushPermission allowed = PushPermission.authorized;
  String? currentToken = 'token-1';
  bool opened = false;
  int prompts = 0, resets = 0;
  final rotations = StreamController<String>.broadcast();
  final messages = StreamController<PushEvent>.broadcast();
  Completer<String?>? tokenGate;
  @override
  String get platform => 'ios';
  @override
  Future<PushPermission> permission({bool request = false}) async {
    if (request) prompts++;
    return allowed;
  }

  @override
  Future<String?> token() => tokenGate?.future ?? Future.value(currentToken);
  @override
  Future<void> resetToken() async {
    resets++;
  }

  @override
  Stream<String> get tokenChanges => rotations.stream;
  @override
  Stream<PushEvent> get events => messages.stream;
  @override
  Future<bool> initiallyOpened() async => opened;
  Future<void> close() async {
    await rotations.close();
    await messages.close();
  }
}

class _Devices implements DeviceRegistration {
  final calls = <String>[];
  Completer<void>? registration;
  bool failRegister = false, failUnregister = false;
  @override
  Future<void> register(
    String token,
    String platform,
    String locale,
    int revision,
  ) async {
    calls.add('register:$token:$platform:$locale:$revision');
    if (failRegister) throw StateError('fixture');
    await registration?.future;
  }

  @override
  Future<void> unregister(String token, int revision) async {
    calls.add('unregister:$token:$revision');
    if (failUnregister) throw StateError('fixture');
  }
}

const _a = (userId: 'a', revision: 1, locale: 'ar');
const _b = (userId: 'b', revision: 3, locale: 'en');
void main() {
  late _Client client;
  late _Devices devices;
  late PushLifecycle lifecycle;
  late List<(PushEvent, PushOwner)> events;
  setUp(() {
    client = _Client();
    devices = _Devices();
    events = [];
    lifecycle = PushLifecycle(
      createClient: () async => client,
      devices: devices,
      report: (_, _) {},
      onEvent: (event, owner) => events.add((event, owner)),
    );
  });
  tearDown(() async {
    lifecycle.dispose();
    await client.close();
  });
  test(
    'unconfigured client is unavailable and issues no registration',
    () async {
      final empty = PushLifecycle(
        createClient: () async => null,
        devices: devices,
        report: (_, _) {},
        onEvent: (_, _) {},
      );
      expect(
        await empty.synchronize(_a, requestPermission: true),
        PushPermission.unavailable,
      );
      expect(devices.calls, isEmpty);
      empty.dispose();
    },
  );
  test('permission is explicit; denied/APNs pending cannot register', () async {
    client.allowed = PushPermission.denied;
    expect(await lifecycle.synchronize(_a), PushPermission.denied);
    expect(client.prompts, 0);
    expect(devices.calls, isEmpty);
    await lifecycle.synchronize(_a, requestPermission: true);
    expect(client.prompts, 1);
    client.allowed = PushPermission.authorized;
    client.currentToken = null;
    expect(await lifecycle.synchronize(_a), PushPermission.notDetermined);
    expect(devices.calls, isEmpty);
  });
  test(
    'refresh retires old token and registration follows current locale',
    () async {
      await lifecycle.synchronize(_a);
      client.currentToken = 'token-2';
      client.rotations.add('token-2');
      await Future<void>.delayed(Duration.zero);
      await lifecycle.synchronize((userId: 'a', revision: 1, locale: 'en'));
      expect(devices.calls, contains('unregister:token-1:1'));
      expect(devices.calls.last, 'register:token-2:ios:en:1');
    },
  );
  test('late token retrieval cannot register under a new owner', () async {
    final gate = client.tokenGate = Completer<String?>();
    final first = lifecycle.synchronize(_a);
    await Future<void>.delayed(Duration.zero);
    final next = lifecycle.synchronize(_b);
    gate.complete('token-1');
    await first;
    await next;
    expect(devices.calls, ['register:token-1:ios:en:3']);
  });
  test(
    'logout serializes behind in-flight registration and resets FCM before new login',
    () async {
      devices.registration = Completer<void>();
      final first = lifecycle.synchronize(_a);
      await Future<void>.delayed(Duration.zero);
      final logout = lifecycle.endSession(2);
      final next = lifecycle.synchronize(_b);
      devices.registration!.complete();
      await first;
      await logout;
      await next;
      expect(devices.calls, [
        'register:token-1:ios:ar:1',
        'unregister:token-1:2',
        'register:token-1:ios:en:3',
      ]);
      expect(client.resets, 1);
    },
  );
  test(
    'deleted account resets Firebase without using revoked API credentials',
    () async {
      await lifecycle.synchronize(_a);
      await lifecycle.endSession(2, unregister: false);
      expect(devices.calls, ['register:token-1:ios:ar:1']);
      expect(client.resets, 1);
    },
  );
  test(
    'uncertain registration still unregisters and resets on logout',
    () async {
      devices.failRegister = true;
      await expectLater(lifecycle.synchronize(_a), throwsStateError);
      devices.failUnregister = true;
      await expectLater(lifecycle.endSession(2), throwsStateError);
      expect(devices.calls.last, 'unregister:token-1:2');
      expect(client.resets, 1);
    },
  );
  test(
    'initial/foreground/open events are owned and disappear on logout/disposal',
    () async {
      client.opened = true;
      await lifecycle.synchronize(_a);
      client.messages.add(PushEvent.foreground);
      client.messages.add(PushEvent.opened);
      await Future<void>.delayed(Duration.zero);
      expect(events.map((e) => e.$1), [
        PushEvent.opened,
        PushEvent.foreground,
        PushEvent.opened,
      ]);
      expect(events.every((e) => e.$2 == _a), isTrue);
      await lifecycle.endSession(2);
      client.messages.add(PushEvent.foreground);
      await Future<void>.delayed(Duration.zero);
      expect(events.length, 3);
      lifecycle.dispose();
    },
  );
  test(
    'device requests use declared body and expected session revision',
    () async {
      final dio = Dio();
      final requests = <RequestOptions>[];
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (request, handler) {
            requests.add(request);
            handler.resolve(
              Response(
                requestOptions: request,
                statusCode: request.method == 'DELETE' ? 204 : 201,
                data: request.method == 'DELETE' ? null : <String, dynamic>{},
              ),
            );
          },
        ),
      );
      final repo = DeviceRegistrationRemote(ApiClient(dio));
      await repo.register('token', 'android', 'ar', 4);
      await repo.unregister('token', 5);
      expect(requests[0].path, '/devices/token');
      expect(requests[0].data, {
        'token': 'token',
        'platform': 'android',
        'locale': 'ar',
      });
      expect(requests[0].extra['sessionRevision'], 4);
      expect(requests[1].method, 'DELETE');
      expect(requests[1].data, {'token': 'token'});
      expect(requests[1].queryParameters, isEmpty);
      expect(requests[1].extra['sessionRevision'], 5);
      dio.close();
    },
  );
  test('obsolete cleanup cannot acquire a newer login bearer token', () async {
    final dio = Dio();
    var networkCalls = 0;
    dio.interceptors.add(
      AuthInterceptor(
        readToken: () async => 'new-account-secret',
        sessionRevision: () => 3,
        onUnauthorized: () async {},
      ),
    );
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (request, handler) {
          networkCalls++;
          handler.resolve(Response(requestOptions: request, statusCode: 204));
        },
      ),
    );
    await expectLater(
      DeviceRegistrationRemote(ApiClient(dio)).unregister('old-token', 2),
      throwsA(anything),
    );
    expect(networkCalls, 0);
    dio.close();
  });
}
