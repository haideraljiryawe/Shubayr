import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  test(
    'secure journal survives recreation and partitions API, account and operation',
    () async {
      final slot = PendingRequestStore.slot(
        'https://api.test',
        'user1',
        'delivery',
        'd',
      );
      final first = await PendingRequestStore().prepare(slot, {
        'status': 'delivered',
        'order_version': 3,
      });
      final restarted = PendingRequestStore();
      final retry = await restarted.prepare(slot, first.body);
      expect(retry.id, first.id);
      expect(retry.body, first.body);
      for (final other in [
        PendingRequestStore.slot(
          'https://other.test',
          'user1',
          'delivery',
          'd',
        ),
        PendingRequestStore.slot('https://api.test', 'user2', 'delivery', 'd'),
        PendingRequestStore.slot('https://api.test', 'user1', 'cart-add', 'd'),
      ]) {
        expect(await restarted.read(other), isNull);
      }
      await expectLater(
        restarted.prepare(slot, {'status': 'delivered', 'order_version': 4}),
        throwsA(isA<AppFailure>()),
      );
      await restarted.complete(slot, 'unrelated-id');
      expect(await restarted.read(slot), isNotNull);
      await restarted.complete(slot, first.id);
      expect(await PendingRequestStore().read(slot), isNull);
      expect((await restarted.prepare(slot, first.body)).id, isNot(first.id));
    },
  );
  test('simultaneous preparation keeps one operation id', () async {
    final store = PendingRequestStore();
    final requests = await Future.wait(
      List.generate(5, (_) => store.prepare('same-slot', {'quantity': 1})),
    );
    expect(requests.map((r) => r.id).toSet(), hasLength(1));
  });
  test('corrupt saved intent is never silently replaced', () async {
    const storage = FlutterSecureStorage();
    await storage.write(key: 'bad', value: '{');
    await expectLater(
      PendingRequestStore().prepare('bad', {'quantity': 1}),
      throwsFormatException,
    );
    expect(await storage.read(key: 'bad'), '{');
  });
}
