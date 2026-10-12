import 'package:shubayr/features/auth/domain/session_exit_tasks.dart';
import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';
import 'package:shubayr/core/storage/session_credentials.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/l10n/generated/app_localizations_en.dart';
import 'package:shubayr/core/l10n/generated/app_localizations_ar.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/auth_repository_remote.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

class _Repository extends AuthRepositoryMock {
  _Repository() : super(delay: Duration.zero);
  Future<void> Function()? delete;
  int calls = 0;
  @override
  Future<void> deleteAccount() async {
    calls++;
    await delete?.call();
  }
}

void main() {
  late _Repository repo;
  late InMemoryTokenStore tokens;
  late PendingRequestStore journals;
  late ProviderContainer container;
  late SessionController controller;
  late int revision;
  setUp(() async {
    repo = _Repository();
    tokens = InMemoryTokenStore();
    journals = PendingRequestStore.memory();
    container = ProviderContainer(
      overrides: [
        appConfigProvider.overrideWithValue(
          const AppConfig(
            apiBaseUrl: 'https://api.shubayr.com',
            dataSource: DataSource.mock,
          ),
        ),
        authRepositoryProvider.overrideWithValue(repo),
        tokenStoreProvider.overrideWithValue(tokens),
        pendingRequestStoreProvider.overrideWithValue(journals),
      ],
    );
    await container.read(sessionControllerProvider.future);
    controller = container.read(sessionControllerProvider.notifier);
    await controller.verifyOtp(phone: '07700000000', code: '123456');
    revision = container.read(sessionCredentialsProvider).revision;
  });
  tearDown(() => container.dispose());

  test('204 clears credentials and only deleted customer journals', () async {
    final cleanup = <bool>[];
    container.read(sessionExitTasksProvider).register((
      revision,
      deleted,
    ) async {
      cleanup.add(deleted);
    });
    final own = PendingRequestStore.slot(
      'https://api.shubayr.com',
      'mock-user',
      'checkout',
      'order',
    );
    final other = PendingRequestStore.slot(
      'https://api.shubayr.com',
      'other',
      'checkout',
      'order',
    );
    await journals.prepare(own, {'address_id': 'private'});
    await journals.prepare(other, {'address_id': 'other'});
    expect(
      await controller.deleteAccount(userId: 'mock-user', revision: revision),
      isTrue,
    );
    expect(
      container.read(sessionControllerProvider).requireValue.isSignedIn,
      isFalse,
    );
    expect(await tokens.readAccessToken(), isNull);
    expect(cleanup, [true]);
    expect(await tokens.readRefreshToken(), isNull);
    expect(await journals.read(own), isNull);
    expect(await journals.read(other), isNotNull);
  });
  test(
    'blockers preserve authentication and produce bilingual specific messages',
    () async {
      const error = AppFailure(
        FailureKind.conflict,
        statusCode: 409,
        code: 'ACCOUNT_DELETION_BLOCKED',
        errors: [
          ApiFieldError(code: 'OPEN_ORDERS', message: 'untrusted raw message'),
          ApiFieldError(code: 'PENDING_RETURNS', message: ''),
          ApiFieldError(code: 'UNSETTLED_AMOUNTS', message: ''),
        ],
      );
      repo.delete = () async => throw error;
      await expectLater(
        controller.deleteAccount(userId: 'mock-user', revision: revision),
        throwsA(same(error)),
      );
      expect(
        container.read(sessionControllerProvider).requireValue.isSignedIn,
        isTrue,
      );
      expect(await tokens.readAccessToken(), isNotNull);
      for (final l10n in [AppLocalizationsEn(), AppLocalizationsAr()]) {
        expect(
          error.localizedMessage(l10n),
          contains(l10n.accountDeletionOpenOrders),
        );
        expect(
          error.localizedMessage(l10n),
          contains(l10n.accountDeletionPendingReturns),
        );
        expect(
          error.localizedMessage(l10n),
          contains(l10n.accountDeletionUnsettled),
        );
        expect(error.localizedMessage(l10n), isNot(contains('untrusted')));
      }
    },
  );
  test('duplicate and old confirmations never issue another delete', () async {
    final gate = Completer<void>();
    repo.delete = () => gate.future;
    final first = controller.deleteAccount(
      userId: 'mock-user',
      revision: revision,
    );
    expect(
      await controller.deleteAccount(userId: 'mock-user', revision: revision),
      isFalse,
    );
    await controller.signOut();
    await controller.verifyOtp(phone: '07700000003', code: '123456');
    expect(
      await controller.deleteAccount(userId: 'mock-user', revision: revision),
      isFalse,
    );
    gate.complete();
    expect(await first, isFalse);
    expect(repo.calls, 1);
    expect(
      container.read(sessionControllerProvider).requireValue.user!.phone,
      '07700000003',
    );
    expect(await tokens.readAccessToken(), isNotNull);
  });
  test('official endpoint accepts empty 204 without invented body', () async {
    final dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          expect(options.method, 'DELETE');
          expect(options.path, '/me/account');
          expect(options.data, isNull);
          handler.resolve(
            Response<void>(requestOptions: options, statusCode: 204),
          );
        },
      ),
    );
    await AuthRepositoryRemote(ApiClient(dio)).deleteAccount();
    dio.close();
  });
}
