import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/address/presentation/screens/address_form_screen.dart';
import 'package:shubayr/features/address/presentation/screens/addresses_screen.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'support/address_fakes.dart';

Future<ProviderContainer> _start(RecordingAddresses repo) async {
  final container = ProviderContainer(
    overrides: [
      dataSourceProvider.overrideWithValue(DataSource.mock),
      notificationSyncProvider.overrideWith((ref) {}),
      unreadCountProvider.overrideWith((ref) async => 0),
      sessionControllerProvider.overrideWith(AddressTestSession.new),
      addressRepositoryProvider.overrideWithValue(repo),
    ],
  );
  await container.read(sessionControllerProvider.future);
  return container;
}

Widget _host(
  ProviderContainer container, {
  Address? address,
  bool list = false,
  String locale = 'en',
  bool dark = false,
  double scale = 1,
}) => UncontrolledProviderScope(
  container: container,
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    home: list
        ? const AddressesScreen()
        : Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                child: const Text('Open form'),
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => AddressFormScreen(address: address),
                  ),
                ),
              ),
            ),
          ),
  ),
);

final otherField = find.byKey(const ValueKey('address-other-phone'));
final primary = find.byKey(const ValueKey('address-use-primary'));
final other = find.byKey(const ValueKey('address-use-other'));
Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _open(WidgetTester tester) => _tap(tester, find.text('Open form'));
Future<void> _save(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  await _tap(tester, find.text('Save'));
}

void main() {
  setUpAll(() async {
    await (FontLoader(
      'Cairo',
    )..addFont(rootBundle.load('assets/fonts/Cairo-Regular.ttf'))).load();
  });
  for (final useOther in [false, true]) {
    testWidgets(
      'create validates and saves actual selected phone other=$useOther',
      (tester) async {
        final repo = RecordingAddresses();
        final container = (await tester.runAsync(() => _start(repo)))!;
        addTearDown(container.dispose);
        await tester.pumpWidget(_host(container));
        await _open(tester);
        expect(
          tester
              .widget<RadioGroup<bool>>(find.byType(RadioGroup<bool>))
              .groupValue,
          isTrue,
        );
        expect(find.text('07700000000'), findsOneWidget);
        expect(otherField, findsNothing);
        await tester.enterText(find.byType(TextFormField).at(1), 'Baghdad');
        await _tap(tester, other);
        expect(
          tester.widget<TextFormField>(otherField).controller!.text,
          isEmpty,
        );
        await tester.enterText(otherField, 'bad');
        await _save(tester);
        expect(repo.created, isEmpty);
        expect(find.text('Enter a valid phone number.'), findsOneWidget);
        await tester.enterText(otherField, '(+٩٦٤) ٧٨١,٢٣٤-٥٦٧٨');
        expect(
          tester.widget<TextFormField>(otherField).controller!.text,
          '+9647812345678',
        );
        if (!useOther) {
          await _tap(tester, primary);
          expect(otherField, findsNothing);
        }
        await _save(tester);
        expect(
          repo.created.single.contactPhone,
          useOther ? '+9647812345678' : '07700000000',
        );
        final saved = container
            .read(addressesControllerProvider)
            .requireValue
            .last;
        expect(saved.contactPhone, repo.created.single.contactPhone);
        expect(find.byType(AddressFormScreen), findsNothing);
      },
    );
  }

  for (final phone in ['07700000000', '07812345678']) {
    testWidgets(
      'editing restores selection and preserves contact and coordinates $phone',
      (tester) async {
        final repo = RecordingAddresses();
        final container = (await tester.runAsync(() => _start(repo)))!;
        addTearDown(container.dispose);
        final address = Address(
          id: 'addr-0',
          city: 'Baghdad',
          contactPhone: phone,
          lat: 33,
          lng: 44,
        );
        await tester.pumpWidget(_host(container, address: address));
        await _open(tester);
        final isPrimary = phone == '07700000000';
        expect(
          tester
              .widget<RadioGroup<bool>>(find.byType(RadioGroup<bool>))
              .groupValue,
          isPrimary,
        );
        if (!isPrimary) {
          expect(
            tester.widget<TextFormField>(otherField).controller!.text,
            phone,
          );
        }
        await _save(tester);
        final saved = container
            .read(addressesControllerProvider)
            .requireValue
            .first;
        expect(saved.contactPhone, phone);
        expect(saved.lat, 33);
        expect(saved.lng, 44);
      },
    );
  }

  testWidgets(
    'cards show independent phone and Primary only for matching contact',
    (tester) async {
      final repo = RecordingAddresses();
      final container = (await tester.runAsync(() => _start(repo)))!;
      addTearDown(container.dispose);
      await tester.pumpWidget(_host(container, list: true));
      await tester.pumpAndSettle();
      expect(find.text('07700000000'), findsOneWidget);
      expect(find.text('Primary'), findsOneWidget);
      expect(find.text('07810000000'), findsWidgets);
      // Clearing another address's default must not lose its Mock-only phone.
      final changeDefault = container
          .read(addressesControllerProvider.notifier)
          .setDefault(
            container.read(addressesControllerProvider).requireValue[1],
          );
      await tester.pumpAndSettle();
      await changeDefault;
      expect(
        container
            .read(addressesControllerProvider)
            .requireValue
            .first
            .contactPhone,
        '07700000000',
      );
      expect(find.text('Primary'), findsOneWidget);
    },
  );

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      testWidgets('contact draft survives resizing $locale $dark', (
        tester,
      ) async {
        final container = (await tester.runAsync(
          () => _start(RecordingAddresses()),
        ))!;
        addTearDown(container.dispose);
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await tester.pumpWidget(
          _host(container, locale: locale, dark: dark, scale: 2),
        );
        await _open(tester);
        await _tap(tester, other);
        await tester.enterText(otherField, '07812345678');
        FocusManager.instance.primaryFocus?.unfocus();
        for (final width in [
          320.0,
          390.0,
          599.0,
          600.0,
          899.0,
          900.0,
          1199.0,
          1200.0,
          1535.0,
          1536.0,
          1920.0,
        ]) {
          await tester.binding.setSurfaceSize(Size(width, 1000));
          await tester.pumpAndSettle();
          expect(
            tester.widget<TextFormField>(otherField).controller!.text,
            '07812345678',
          );
          expect(tester.takeException(), isNull, reason: 'width=$width');
        }
      });
    }
  }

  testWidgets('remote mode accepts normalized international delivery contacts', (
    tester,
  ) async {
    // Use an explicitly remote configuration without issuing network requests.
    final repo = RecordingAddresses();
    final remote = ProviderContainer(
      overrides: [
        notificationSyncProvider.overrideWith((ref) {}),
        unreadCountProvider.overrideWith((ref) async => 0),
        dataSourceProvider.overrideWithValue(DataSource.remote),
        sessionControllerProvider.overrideWith(AddressTestSession.new),
        addressRepositoryProvider.overrideWithValue(repo),
      ],
    );
    addTearDown(remote.dispose);
    await remote.read(sessionControllerProvider.future);
    await tester.pumpWidget(_host(remote));
    await _open(tester);
    await tester.enterText(find.byType(TextFormField).at(1), 'Baghdad');
    await _save(tester);
    expect(
      repo.created,
      isEmpty,
    ); // local account number needs explicit country code
    await _tap(tester, other);
    await tester.enterText(otherField, '(+٩٦٤) ٧٨١ ٢٣٤-٥٦٧٨');
    await _save(tester);
    expect(repo.created.single.contactPhone, '+9647812345678');
    expect(find.byType(AddressFormScreen), findsNothing);
  });
}
