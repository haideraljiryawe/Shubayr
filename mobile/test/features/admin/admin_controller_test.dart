import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/admin/domain/admin_repository.dart';
import 'package:shubayr/features/admin/presentation/providers/admin_providers.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'support/admin_fakes.dart';

void main() {
  late ProviderContainer container;
  late RecordingAdmin repo;
  late AdminTestSession session;
  const query = AdminQuery(AdminResource.users);
  setUp(() async {
    repo = RecordingAdmin();
    session = AdminTestSession();
    container = ProviderContainer(
      overrides: [
        adminRepositoryProvider.overrideWithValue(repo),
        sessionControllerProvider.overrideWith(() => session),
      ],
    );
    await container.read(sessionControllerProvider.future);
    container.listen(adminListProvider(query), (_, _) {});
  });
  tearDown(() => container.dispose());
  test('list appends once, retries failed page and refresh restarts', () async {
    await container.read(adminListProvider(query).future);
    final controller = container.read(adminListProvider(query).notifier);
    repo.onFetch = (_) async => throw const AppFailure.network();
    await controller.loadMore();
    expect(
      container.read(adminListProvider(query)).requireValue.items,
      hasLength(20),
    );
    expect(
      container.read(adminListProvider(query)).requireValue.appendError,
      isA<AppFailure>(),
    );
    repo.onFetch = null;
    await Future.wait([controller.loadMore(), controller.loadMore()]);
    expect(
      container.read(adminListProvider(query)).requireValue.items,
      hasLength(25),
    );
    await controller.refresh();
    expect(
      container.read(adminListProvider(query)).requireValue.items,
      hasLength(20),
    );
    expect(repo.requests.map((r) => r.page), [1, 2, 2, 1]);
  });
  test(
    'query and role filter reach the repository before pagination',
    () async {
      const filtered = AdminQuery(
        AdminResource.users,
        text: 'مستخدم 2',
        role: 'warehouse',
      );
      final sub = container.listen(adminListProvider(filtered), (_, _) {});
      addTearDown(sub.close);
      final list = await container.read(adminListProvider(filtered).future);
      expect(list.page.total, 4);
      expect(list.items.every((u) => u.text('role') == 'warehouse'), isTrue);
      expect(repo.requests.last.query, 'مستخدم 2');
      expect(repo.requests.last.role, 'warehouse');
    },
  );
  test(
    'save success is not converted to failure by a subsequent read error',
    () async {
      await container.read(adminListProvider(query).future);
      repo.onFetch = (_) async => throw const AppFailure.network();
      final saved = await container
          .read(adminListProvider(query).notifier)
          .save({'name': 'New', 'phone': '07888888888', 'role': 'customer'});
      expect(saved, isTrue);
      await expectLater(
        container.read(adminListProvider(query).future),
        throwsA(isA<AppFailure>()),
      );
      expect(repo.writes, hasLength(1));
    },
  );
  test('failed save keeps data and permits retry', () async {
    await container.read(adminListProvider(query).future);
    final controller = container.read(adminListProvider(query).notifier);
    repo.onSave = (_, _, _) async => throw const AppFailure.network();
    await expectLater(
      controller.save({'phone': '07799999999'}),
      throwsA(isA<AppFailure>()),
    );
    expect(
      container.read(adminListProvider(query)).requireValue.items,
      hasLength(20),
    );
    repo.onSave = null;
    expect(
      await controller.save({'phone': '07799999999', 'role': 'customer'}),
      isTrue,
    );
    await container.read(adminListProvider(query).future);
  });
  test(
    'role changes refresh dependent user lists and complete role lookups',
    () async {
      await container.read(adminListProvider(query).future);
      const roles = AdminQuery(AdminResource.roles);
      final sub = container.listen(adminListProvider(roles), (_, _) {});
      addTearDown(sub.close);
      await container.read(adminListProvider(roles).future);
      expect(
        await container.read(adminListProvider(roles).notifier).save({
          'name': 'helper',
          'permissions': ['catalog.view'],
        }),
        isTrue,
      );
      final lookupSub = container.listen(
        adminLookupsProvider(roles),
        (_, _) {},
      );
      addTearDown(lookupSub.close);
      final options = await container.read(adminLookupsProvider(roles).future);
      expect(options.any((r) => r.text('name') == 'helper'), isTrue);
      await container.read(adminListProvider(query).future);
    },
  );
  test('lookup loads locations from later pages', () async {
    const lookup = AdminQuery(
      AdminResource.locations,
      warehouseId: 'warehouse-1',
    );
    final sub = container.listen(adminLookupsProvider(lookup), (_, _) {});
    addTearDown(sub.close);
    final locations = await container.read(adminLookupsProvider(lookup).future);
    expect(locations, hasLength(25));
    expect(locations.last.id, 'location-1-25');
  });
  test('readonly staff cannot write even through the controller', () async {
    session.change(
      const Session.signedIn(
        User(id: 'p', role: 'purchasing', permissions: ['purchasing.view']),
      ),
    );
    const suppliers = AdminQuery(AdminResource.suppliers);
    final sub = container.listen(adminListProvider(suppliers), (_, _) {});
    addTearDown(sub.close);
    await container.read(adminListProvider(suppliers).future);
    await expectLater(
      container.read(adminListProvider(suppliers).notifier).save({
        'name': 'Denied',
      }),
      throwsA(isA<AppFailure>()),
    );
    expect(repo.writes, isEmpty);
  });
  test('customer cannot read or mutate administration', () async {
    session.change(
      const Session.signedIn(User(id: 'customer', role: 'customer')),
    );
    await expectLater(
      container.read(adminListProvider(query).future),
      throwsA(isA<AppFailure>()),
    );
    await expectLater(
      container.read(adminListProvider(query).notifier).delete('user-1'),
      throwsA(isA<AppFailure>()),
    );
    expect(repo.deletes, isEmpty);
  });
  test('late append does not enter a different staff session', () async {
    await container.read(adminListProvider(query).future);
    final pending = Completer<AdminPage>();
    repo.onFetch = (_) => pending.future;
    final append = container.read(adminListProvider(query).notifier).loadMore();
    repo.onFetch = null;
    session.change(
      const Session.signedIn(
        User(id: 'next', role: 'manager', permissions: ['catalog.manage']),
      ),
    );
    await expectLater(
      container.read(adminListProvider(query).future),
      throwsA(isA<AppFailure>()),
    );
    pending.complete(
      AdminPage(
        items: [
          AdminRecord({'id': 'stale'}),
        ],
        page: 2,
        perPage: 20,
        total: 21,
      ),
    );
    await append;
    expect(container.read(adminListProvider(query)).hasError, isTrue);
  });
  test(
    'warehouse change clears selected location and session change clears all',
    () async {
      final controller = container.read(warehouseSelectionProvider.notifier);
      final w1 = AdminRecord({'id': 'w1', 'is_active': true}),
          w2 = AdminRecord({'id': 'w2', 'is_active': true});
      final location = AdminRecord({'id': 'l1', 'warehouse_id': 'w1'});
      controller.selectWarehouse(w1);
      controller.selectLocation(location);
      expect(container.read(warehouseSelectionProvider).location?.id, 'l1');
      controller.selectWarehouse(w2);
      expect(container.read(warehouseSelectionProvider).location, isNull);
      expect(
        () => controller.selectLocation(location),
        throwsA(isA<AppFailure>()),
      );
      session.change(const Session.signedOut());
      expect(container.read(warehouseSelectionProvider).warehouse, isNull);
    },
  );
}
