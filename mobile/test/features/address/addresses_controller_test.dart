import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

import 'support/address_fakes.dart';

void main() {
  late RecordingAddresses repo;
  late ProviderContainer container;
  late AddressTestSession session;
  AddressesController controller() =>
      container.read(addressesControllerProvider.notifier);
  List<Address> items() =>
      container.read(addressesControllerProvider).requireValue;

  setUp(() async {
    repo = RecordingAddresses();
    session = AddressTestSession();
    container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [
        sessionControllerProvider.overrideWith(() => session),
        addressRepositoryProvider.overrideWithValue(repo),
      ],
    );
    await container.read(sessionControllerProvider.future);
  });
  tearDown(() => container.dispose());

  test('refresh retains data, reports failure and can recover', () async {
    final previous = await container.read(addressesControllerProvider.future);
    final pending = Completer<AddressPage>();
    repo.onFetch = (_) => pending.future;
    final notifier = controller();
    final refresh = notifier.refresh();
    await Future<void>.delayed(Duration.zero);
    expect(notifier.isRefreshing, isTrue);
    expect(container.read(addressesControllerProvider).isLoading, isTrue);
    expect(container.read(addressesControllerProvider).value, same(previous));
    pending.completeError(const AppFailure.network());
    await refresh;
    final failed = container.read(addressesControllerProvider);
    expect(notifier.isRefreshing, isFalse);
    expect(failed.isLoading, isFalse);
    expect(failed.error, isA<AppFailure>());
    expect(failed.value, same(previous));
    repo.onFetch = (_) async => addressPage((page: 1, perPage: 8), total: 1);
    await notifier.refresh();
    expect(container.read(addressesControllerProvider).hasError, isFalse);
    expect(notifier.isRefreshing, isFalse);
  });

  test('session reload cancels an old refresh and queued work', () async {
    await container.read(addressesControllerProvider.future);
    final oldPage = Completer<AddressPage>();
    repo.onFetch = (_) => oldPage.future;
    final notifier = controller();
    final oldRefresh = notifier.refresh();
    final queuedRefresh = notifier.refresh();
    await Future<void>.delayed(Duration.zero);
    expect(notifier.isRefreshing, isTrue);
    final newPage = Completer<AddressPage>();
    repo.onFetch = (_) => newPage.future;
    session.setSession(
      const Session.signedIn(User(id: 'next', role: 'customer')),
    );
    final next = container.read(addressesControllerProvider.future);
    expect(notifier.isRefreshing, isFalse);
    expect(container.read(addressesControllerProvider).isLoading, isTrue);
    final requests = repo.requests.length;
    oldPage.completeError(const AppFailure.network());
    await oldRefresh;
    await queuedRefresh;
    expect(repo.requests, hasLength(requests));
    expect(container.read(addressesControllerProvider).hasError, isFalse);
    newPage.complete(addressPage((page: 1, perPage: 8), total: 1));
    await next;
    expect(container.read(addressesControllerProvider).hasError, isFalse);
    expect(notifier.isRefreshing, isFalse);
  });

  test(
    'reads beyond the old 100-address limit and finds a later default',
    () async {
      repo.onFetch = (r) async => addressPage(r, total: 105, defaultIndex: 104);
      final loaded = await container.read(addressesControllerProvider.future);
      expect(loaded, hasLength(105));
      expect(loaded.singleWhere((a) => a.isDefault).id, 'addr-104');
      expect(repo.requests.map((r) => r.page), List.generate(14, (i) => i + 1));
    },
  );

  test(
    'later-page failure publishes no partial list and retry starts at one',
    () async {
      repo.onFetch = (r) async {
        if (r.page == 2) throw const AppFailure.network();
        return addressPage(r);
      };
      await expectLater(
        container.read(addressesControllerProvider.future),
        throwsA(isA<AppFailure>()),
      );
      expect(container.read(addressesControllerProvider).hasValue, isFalse);
      repo.onFetch = null;
      await controller().refresh();
      expect(items(), hasLength(10));
      expect(repo.requests.map((r) => r.page), [1, 2, 1, 2]);
    },
  );

  test(
    'later-page CRUD and default changes retain every other address',
    () async {
      await container.read(addressesControllerProvider.future);
      await controller().setDefault(items().last);
      expect(items().singleWhere((a) => a.isDefault).id, 'addr-9');
      await controller().edit(
        'addr-9',
        const AddressInput(city: 'Basra', isDefault: true, lat: 30, lng: 47),
      );
      expect(items().last.city, 'Basra');
      await controller().add(
        const AddressInput(city: 'Mosul', isDefault: true),
      );
      expect(items(), hasLength(11));
      expect(items().singleWhere((a) => a.isDefault).city, 'Mosul');
      expect(items().firstWhere((a) => a.id == 'addr-9').lat, 30);
      await controller().remove('addr-8');
      await controller().refresh();
      expect(items(), hasLength(10));
      expect(items().any((a) => a.id == 'addr-8'), isFalse);
      expect(items().singleWhere((a) => a.isDefault).city, 'Mosul');
    },
  );

  test(
    'failed mutation leaves all pages intact and does not block the next',
    () async {
      await container.read(addressesControllerProvider.future);
      repo.onDelete = (_) async => throw const AppFailure.network();
      await expectLater(
        controller().remove('addr-9'),
        throwsA(isA<AppFailure>()),
      );
      expect(items(), hasLength(10));
      repo.onDelete = null;
      await controller().remove('addr-9');
      expect(items(), hasLength(9));
    },
  );

  test(
    'refresh waits for its last page then queued mutations preserve it',
    () async {
      await container.read(addressesControllerProvider.future);
      final lastPage = Completer<AddressPage>();
      repo.onFetch = (r) async =>
          r.page == 2 ? lastPage.future : addressPage(r);
      var finished = false;
      final refresh = controller().refresh().then((_) => finished = true);
      final remove = controller().remove('addr-9');
      await Future<void>.delayed(Duration.zero);
      expect(finished, isFalse);
      expect(repo.deleted, isEmpty);
      lastPage.complete(addressPage((page: 2, perPage: 8)));
      await refresh;
      await remove;
      expect(items(), hasLength(9));
      expect(items().any((a) => a.id == 'addr-9'), isFalse);
    },
  );

  test('mutations wait for the initial final page', () async {
    final lastPage = Completer<AddressPage>();
    repo.onFetch = (r) async => r.page == 2 ? lastPage.future : addressPage(r);
    container.read(addressesControllerProvider);
    final removal = controller().remove('addr-9');
    await Future<void>.delayed(Duration.zero);
    expect(repo.deleted, isEmpty);
    lastPage.complete(addressPage((page: 2, perPage: 8)));
    await removal;
    expect(items(), hasLength(9));
  });

  test('overlapping pages deduplicate address IDs', () async {
    repo.onFetch = (r) async => r.page == 1
        ? addressPage(r)
        : const AddressPage(
            page: 2,
            perPage: 8,
            total: 10,
            data: [
              Address(id: 'addr-7', city: 'Updated'),
              Address(id: 'addr-8', city: 'Baghdad'),
            ],
          );
    final loaded = await container.read(addressesControllerProvider.future);
    expect(loaded, hasLength(9));
    expect(loaded.singleWhere((a) => a.id == 'addr-7').city, 'Updated');
  });

  test(
    'inconsistent empty page fails instead of hiding remaining addresses',
    () async {
      repo.onFetch = (r) async =>
          AddressPage(page: r.page, perPage: r.perPage, total: 10);
      await expectLater(
        container.read(addressesControllerProvider.future),
        throwsA(isA<AppFailure>()),
      );
      expect(repo.requests, hasLength(1));
    },
  );

  test('logout discards an old page and cancels queued mutations', () async {
    final pending = Completer<AddressPage>();
    repo.onFetch = (_) => pending.future;
    container.read(addressesControllerProvider);
    final remove = controller().remove('addr-9');
    await Future<void>.delayed(Duration.zero);
    session.setSession(const Session.signedOut());
    await container.read(addressesControllerProvider.future);
    pending.complete(addressPage((page: 1, perPage: 8)));
    await remove;
    expect(items(), isEmpty);
    expect(repo.requests, hasLength(1));
    expect(repo.deleted, isEmpty);
  });

  test(
    'new customer does not wait for old mutation or receive its error',
    () async {
      await container.read(addressesControllerProvider.future);
      final pending = Completer<void>();
      repo.onDelete = (_) => pending.future;
      final oldMutation = controller().remove('addr-9');
      await Future<void>.delayed(Duration.zero);
      session.setSession(
        const Session.signedIn(User(id: 'next', role: 'customer')),
      );
      await container.read(addressesControllerProvider.future);
      repo.onDelete = null;
      await controller().remove('addr-8');
      pending.completeError(const AppFailure.network());
      await oldMutation;
      expect(items(), hasLength(9));
      expect(items().any((a) => a.id == 'addr-9'), isTrue);
    },
  );

  test('guest does not read pages or write addresses', () async {
    session.setSession(const Session.signedOut());
    await container.read(addressesControllerProvider.future);
    await expectLater(
      controller().add(const AddressInput(city: 'Baghdad')),
      throwsA(isA<AppFailure>()),
    );
    expect(repo.requests, isEmpty);
    expect(repo.created, isEmpty);
  });

  test(
    'deleting all addresses followed by refresh gives an empty list',
    () async {
      await container.read(addressesControllerProvider.future);
      for (final address in [...items()]) {
        await controller().remove(address.id);
      }
      await controller().refresh();
      expect(items(), isEmpty);
    },
  );
}
