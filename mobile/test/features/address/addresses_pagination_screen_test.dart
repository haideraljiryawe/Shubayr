import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'dart:async';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/data/user.dart';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/widgets/app_card.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/address/presentation/screens/address_form_screen.dart';
import 'package:shubayr/features/address/presentation/screens/addresses_screen.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

import 'support/address_fakes.dart';

Widget _host(
  RecordingAddresses repository, {
  String locale = 'en',
  bool dark = false,
  Widget? home,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    sessionControllerProvider.overrideWith(AddressTestSession.new),
    addressRepositoryProvider.overrideWithValue(repository),
  ],
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    home: home ?? const AddressesScreen(),
  ),
);

void main() {
  testWidgets('refresh keeps content but a new session hides previous data', (
    tester,
  ) async {
    final repo = RecordingAddresses()
      ..onFetch = (r) async => addressPage(r, total: 1);
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    expect(find.text('Address 0'), findsOneWidget);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(AddressesScreen)),
    );
    final oldPage = Completer<AddressPage>();
    repo.onFetch = (_) => oldPage.future;
    final refresh = container
        .read(addressesControllerProvider.notifier)
        .refresh();
    await tester.pump();
    expect(find.text('Address 0'), findsOneWidget);
    expect(find.byType(RefreshIndicator), findsOneWidget);
    final newPage = Completer<AddressPage>();
    repo.onFetch = (_) => newPage.future;
    (container.read(sessionControllerProvider.notifier) as AddressTestSession)
        .setSession(const Session.signedIn(User(id: 'next', role: 'customer')));
    await tester.pump();
    await tester.pump();
    expect(find.text('Address 0'), findsNothing);
    oldPage.completeError(const AppFailure.network());
    await tester.pump();
    await refresh;
    expect(find.text('Retry'), findsNothing);
    newPage.complete(const AddressPage(page: 1, perPage: 100, total: 0));
    await tester.pumpAndSettle();
    expect(container.read(addressesControllerProvider).hasError, isFalse);
    expect(find.text('Address 0'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('Cairo')
      ..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-SemiBold.ttf'))
      ..addFont(rootBundle.load('assets/fonts/Cairo-Bold.ttf'));
    await font.load();
  });

  testWidgets(
    'later address can become default and be deleted without losing other pages',
    (tester) async {
      final repo = RecordingAddresses();
      await tester.pumpWidget(_host(repo));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('عنوان 9'), 300);
      await tester.pumpAndSettle();
      final card = find.ancestor(
        of: find.text('عنوان 9'),
        matching: find.byType(AppCard),
      );
      final menu = find.descendant(
        of: card,
        matching: find.byType(PopupMenuButton<String>),
      );
      await tester.tap(menu);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Set as default'));
      await tester.pumpAndSettle();
      final container = ProviderScope.containerOf(
        tester.element(find.byType(AddressesScreen)),
      );
      var items = container.read(addressesControllerProvider).requireValue;
      expect(items.singleWhere((a) => a.isDefault).id, 'addr-9');
      expect(items, hasLength(10));
      await tester.tap(menu);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Delete'));
      await tester.pumpAndSettle();
      items = container.read(addressesControllerProvider).requireValue;
      expect(items, hasLength(9));
      expect(items.any((a) => a.id == 'addr-9'), isFalse);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('later-page error offers retry and reveals the whole list', (
    tester,
  ) async {
    final repo = RecordingAddresses()
      ..onFetch = (r) async {
        if (r.page == 2) throw const AppFailure.network();
        return addressPage(r, total: 105);
      };
    await tester.pumpWidget(_host(repo));
    await tester.pumpAndSettle();
    expect(find.byType(AppCard), findsNothing);
    expect(find.text('Retry'), findsOneWidget);
    repo.onFetch = null;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('عنوان 9'), 300);
    expect(repo.requests.map((r) => r.page), [1, 2, 1]);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'empty address list supports pull refresh until every page completes',
    (tester) async {
      final repo = RecordingAddresses()
        ..onFetch = (r) async => addressPage(r, total: 0);
      await tester.pumpWidget(_host(repo));
      await tester.pumpAndSettle();
      expect(find.text('No saved addresses'), findsOneWidget);
      final pending = Completer<AddressPage>();
      repo.onFetch = (r) async =>
          r.page == 1 ? addressPage(r, total: 105) : pending.future;
      await tester.drag(find.byType(Scrollable), const Offset(0, 500));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(find.byType(RefreshProgressIndicator), findsOneWidget);
      pending.complete(addressPage((page: 2, perPage: 100), total: 105));
      await tester.pumpAndSettle();
      expect(find.byType(RefreshProgressIndicator), findsNothing);
      expect(find.text('No saved addresses'), findsNothing);
      expect(repo.requests.map((r) => r.page), [1, 1, 2]);
    },
  );

  testWidgets('failed save keeps the form open and allows a successful retry', (
    tester,
  ) async {
    final repo = RecordingAddresses()
      ..onCreate = (_) async => throw const AppFailure.network();
    await tester.pumpWidget(
      _host(
        repo,
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const AddressFormScreen(),
                ),
              ),
              child: const Text('Open form'),
            ),
          ),
        ),
      ),
    );
    // The real authenticated route waits for session restoration before entry.
    await ProviderScope.containerOf(
      tester.element(find.text('Open form')),
    ).read(sessionControllerProvider.future);
    await tester.tap(find.text('Open form'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(1), 'Baghdad');
    await tester.ensureVisible(find.text('Save'));
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.byType(AddressFormScreen), findsOneWidget);
    expect(find.byType(SnackBar), findsOneWidget);
    repo.onCreate = null;
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.byType(AddressFormScreen), findsNothing);
    final container = ProviderScope.containerOf(
      tester.element(find.text('Open form')),
    );
    expect(
      container.read(addressesControllerProvider).requireValue,
      hasLength(11),
    );
    expect(tester.takeException(), isNull);
  });

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets(
        'all address cards are reachable at 320, $locale, dark=$dark',
        (tester) async {
          await tester.binding.setSurfaceSize(const Size(320, 700));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          await tester.pumpWidget(
            _host(RecordingAddresses(), locale: locale, dark: dark),
          );
          await tester.pumpAndSettle();
          await tester.scrollUntilVisible(find.text('عنوان 9'), 300);
          await tester.pumpAndSettle();
          expect(find.text('عنوان 9'), findsOneWidget);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
