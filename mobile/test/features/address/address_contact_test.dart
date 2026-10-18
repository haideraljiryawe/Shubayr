import '../../helpers/governorates.dart';
import 'dart:async';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/widgets/app_button.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:flutter/material.dart';
import 'package:shubayr/core/utils/international_phone.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/tokens/app_spacing.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/address/presentation/screens/address_form_screen.dart';
import 'package:shubayr/features/address/presentation/screens/addresses_screen.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'support/address_fakes.dart';

Future<ProviderContainer> _start(RecordingAddresses repo) async {
  final container = ProviderContainer(
    overrides: [
      testGovernoratesOverride,
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
  TargetPlatform? platform,
}) => UncontrolledProviderScope(
  container: container,
  child: MaterialApp(
    locale: Locale(locale),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme:
        (dark
                ? AppTheme.dark(const Brand.bundled())
                : AppTheme.light(const Brand.bundled()))
            .copyWith(platform: platform),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      // Match the app-level horizontal SafeArea; each page owns its bottom.
      child: SafeArea(top: false, bottom: false, child: child!),
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

Future<void> _open(WidgetTester tester) async {
  await _tap(tester, find.text('Open form'));
  await selectTestGovernorate(tester);
}

Future<void> _save(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  await _tap(tester, find.text('Save'));
}

void main() {
  for (final locale in ['ar', 'en']) {
    for (final edit in [false, true]) {
      testWidgets(
        'save matches address fields and keeps busy geometry $locale edit=$edit',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = const Size(390, 1000);
          addTearDown(tester.view.reset);
          final repo = _PendingSaveAddresses();
          final container = (await tester.runAsync(() => _start(repo)))!;
          addTearDown(container.dispose);
          await tester.pumpWidget(
            _host(
              container,
              locale: locale,
              address: edit
                  ? const Address(
                      id: 'addr-0',
                      city: 'Baghdad',
                      contactPhone: '+9647700000000',
                    )
                  : null,
            ),
          );
          await _open(tester);
          await tester.enterText(find.byType(TextFormField).at(1), 'Baghdad');
          FocusManager.instance.primaryFocus?.unfocus();
          await tester.pumpAndSettle();
          final button = find.byType(AppButton);
          for (final size in [
            const Size(390, 1000),
            const Size(834, 1194),
            const Size(1194, 834),
            const Size(390, 1000),
          ]) {
            tester.view.physicalSize = size;
            await tester.pumpAndSettle();
            await tester.ensureVisible(button);
            await tester.pumpAndSettle();
            final rect = tester.getRect(button);
            final fields = tester.getRect(find.byType(ResponsiveFields));
            final first = tester.getRect(find.byType(TextFormField).at(0));
            final second = tester.getRect(find.byType(TextFormField).at(1));
            final edges = first.expandToInclude(second);
            expect(rect.left, closeTo(fields.left, .01));
            expect(rect.right, closeTo(fields.right, .01));
            expect(rect.left, closeTo(edges.left, .01));
            expect(rect.right, closeTo(edges.right, .01));
            expect(button.hitTestable(), findsOneWidget);
            expect(tester.takeException(), isNull);
          }
          final before = tester.getRect(button);
          final l10n = AppLocalizations.of(tester.element(button));
          expect(tester.widget<AppButton>(button).label, l10n.actionSave);
          expect(tester.widget<AppButton>(button).icon, Icons.check);
          await tester.tap(button);
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 200));
          expect(tester.widget<AppButton>(button).isLoading, isTrue);
          expect(
            tester
                .widget<ElevatedButton>(
                  find.descendant(
                    of: button,
                    matching: find.byType(ElevatedButton),
                  ),
                )
                .onPressed,
            isNull,
          );
          expect(tester.getRect(button), before);
          await tester.tap(button);
          await tester.pump();
          expect(repo.created.length + repo.updated.length, 1);
          repo.pending.complete(
            const Address(
              id: 'addr-0',
              city: 'Baghdad',
              contactPhone: '+9647700000000',
            ),
          );
          await tester.pumpAndSettle();
          expect(find.byType(AddressFormScreen), findsNothing);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  for (final locale in ['ar', 'en']) {
    for (final dark in [false, true]) {
      for (final phone in ['+9647700000000', '+123456789012345', '']) {
        testWidgets(
          'primary phone is readable without clipping $locale dark=$dark phone=$phone',
          (tester) async {
            final container = (await tester.runAsync(
              () => _start(RecordingAddresses()),
            ))!;
            addTearDown(container.dispose);
            (container.read(sessionControllerProvider.notifier)
                    as AddressTestSession)
                .setSession(
                  Session.signedIn(
                    User(id: 'customer', role: 'customer', phone: phone),
                  ),
                );
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.reset);
            for (final scale in [1.0, 1.5, 2.0]) {
              for (final width in [320.0, 600.0]) {
                tester.view.physicalSize = Size(width, 1000);
                await tester.pumpWidget(
                  _host(
                    container,
                    address: const Address(id: 'addr-0', city: 'Baghdad'),
                    locale: locale,
                    dark: dark,
                    scale: scale,
                  ),
                );
                await _open(tester);
                await tester.ensureVisible(primary);
                await tester.pumpAndSettle();
                if (phone.isNotEmpty) {
                  await _tap(tester, primary);
                  final field = find.descendant(
                    of: find.byKey(const ValueKey('address-primary-phone')),
                    matching: find.byType(Text),
                  );
                  await tester.ensureVisible(field);
                  await tester.pumpAndSettle();
                  final input = tester.widget<Text>(field);
                  expect(input.data, InternationalPhone.display(phone));
                  expect(input.textDirection, TextDirection.ltr);
                  expect(input.maxLines, isNull);
                  final l10n = AppLocalizations.of(tester.element(primary));
                  final titleBounds = tester.getRect(
                    find.text(l10n.addressUsePrimaryPhone),
                  );
                  expect(
                    tester.getRect(field).top - titleBounds.bottom,
                    greaterThanOrEqualTo(AppSpacing.radioSubtitleGap - .01),
                  );

                  expect(tester.getRect(field).width, lessThan(width));
                }
                expect(tester.takeException(), isNull);
                await tester.pumpWidget(const SizedBox.shrink());
              }
            }
          },
        );
      }
    }
  }

  for (final device in [
    (name: 'Android buttons', platform: TargetPlatform.android, bottom: 48.0),
    (name: 'Android gestures', platform: TargetPlatform.android, bottom: 24.0),
    (name: 'iOS indicator', platform: TargetPlatform.iOS, bottom: 34.0),
  ]) {
    for (final size in [
      const Size(320, 568),
      const Size(402, 874),
      const Size(874, 402),
    ]) {
      for (final edit in [false, true]) {
        for (final saveWithKeyboard in [false, true]) {
          testWidgets(
            'safe address form ${device.name} $size edit=$edit keyboard=$saveWithKeyboard',
            (tester) async {
              tester.view.devicePixelRatio = 1;
              tester.view.physicalSize = size;
              final side = size.width > size.height ? 32.0 : 0.0;
              tester.view.viewPadding = FakeViewPadding(
                top: 24,
                left: side,
                right: side,
                bottom: device.bottom,
              );
              tester.view.padding = FakeViewPadding(
                top: 24,
                left: side,
                right: side,
                bottom: device.bottom,
              );
              addTearDown(tester.view.reset);
              final repo = RecordingAddresses();
              final container = (await tester.runAsync(() => _start(repo)))!;
              addTearDown(container.dispose);
              await tester.pumpWidget(
                _host(
                  container,
                  platform: device.platform,
                  address: edit
                      ? const Address(
                          id: 'addr-0',
                          city: 'Baghdad',
                          contactPhone: '+9647812345678',
                        )
                      : null,
                ),
              );
              await _open(tester);
              final city = find.byType(TextFormField).at(1);
              await tester.ensureVisible(city);
              await tester.enterText(city, 'Baghdad');
              FocusManager.instance.primaryFocus?.unfocus();
              await tester.pumpAndSettle();
              // Adding an optional field grows the form after its first layout.
              await _tap(tester, other);
              await tester.ensureVisible(otherField);
              await tester.enterText(otherField, '+9647812345678');
              await tester.pumpAndSettle();
              final scroll = tester
                  .state<ScrollableState>(find.byType(Scrollable).first)
                  .position;
              final save = find.widgetWithText(ElevatedButton, 'Save');
              Rect? closedBounds;
              for (final keyboard in [0.0, 180.0, 0.0]) {
                tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
                tester.view.padding = FakeViewPadding(
                  top: 24,
                  left: side,
                  right: side,
                  bottom: keyboard == 0 ? device.bottom : 0,
                );
                await tester.pumpAndSettle();
                if (keyboard > 0) {
                  final input = tester.getRect(
                    find.descendant(
                      of: otherField,
                      matching: find.byType(EditableText),
                    ),
                  );
                  expect(
                    input.bottom,
                    lessThanOrEqualTo(size.height - keyboard),
                  );
                }
                // Reach the real end of the scroll range, not merely the widget tree.
                await tester.drag(
                  find.byType(SingleChildScrollView),
                  const Offset(0, -2000),
                );
                await tester.pumpAndSettle();
                expect(scroll.pixels, closeTo(scroll.maxScrollExtent, .01));
                final button = tester.getRect(save);
                final usableBottom =
                    size.height - (keyboard > 0 ? keyboard : device.bottom);
                expect(
                  button.bottom,
                  lessThanOrEqualTo(usableBottom - AppSpacing.screenH + .01),
                );
                if (scroll.maxScrollExtent > 0) {
                  expect(
                    button.bottom,
                    closeTo(usableBottom - AppSpacing.screenH, .01),
                  );
                }
                expect(
                  button.top,
                  greaterThanOrEqualTo(
                    tester.getRect(find.byType(AppBar)).bottom,
                  ),
                );
                expect(button.left, greaterThanOrEqualTo(side));
                expect(button.right, lessThanOrEqualTo(size.width - side));
                expect(save.hitTestable(), findsOneWidget);
                if (closedBounds == null) {
                  closedBounds = button;
                } else if (keyboard == 0) {
                  expect(button, closedBounds);
                }
                expect(tester.takeException(), isNull);
              }
              if (saveWithKeyboard) {
                tester.view.viewInsets = const FakeViewPadding(bottom: 180);
                tester.view.padding = FakeViewPadding(
                  top: 24,
                  left: side,
                  right: side,
                );
                await tester.pumpAndSettle();
                await tester.drag(
                  find.byType(SingleChildScrollView),
                  const Offset(0, -2000),
                );
                await tester.pumpAndSettle();
              }
              // Tap near the lower edge, which was previously in the system area.
              final button = tester.getRect(save);
              await tester.tapAt(Offset(button.center.dx, button.bottom - 4));
              await tester.pumpAndSettle();
              expect(edit ? repo.updated.length : repo.created.length, 1);
              expect(find.byType(AddressFormScreen), findsNothing);
              expect(tester.takeException(), isNull);
            },
          );
        }
      }
    }
  }

  setUpAll(() async {
    await (FontLoader('Zain')
          ..addFont(rootBundle.load('assets/fonts/Zain-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Zain-Bold.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Zain-ExtraBold.ttf')))
        .load();
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
        expect(
          find.text(InternationalPhone.display('+9647700000000')),
          findsOneWidget,
        );
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
          '7812345678',
        );
        if (!useOther) {
          await _tap(tester, primary);
          expect(otherField, findsNothing);
        }
        await _save(tester);
        expect(
          repo.created.single.contactPhone,
          useOther ? '+9647812345678' : '+9647700000000',
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

  for (final phone in ['+9647700000000', '+9647812345678']) {
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
        final isPrimary = phone == '+9647700000000';
        expect(
          tester
              .widget<RadioGroup<bool>>(find.byType(RadioGroup<bool>))
              .groupValue,
          isPrimary,
        );
        if (!isPrimary) {
          expect(
            tester.widget<TextFormField>(otherField).controller!.text,
            InternationalPhone.parse(phone)!.nsn,
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
      (container.read(sessionControllerProvider.notifier) as AddressTestSession)
          .setSession(
            const Session.signedIn(
              User(id: 'customer', role: 'customer', phone: '07700000000'),
            ),
          );
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

  testWidgets(
    'alternate country and local digits survive primary-contact toggles',
    (tester) async {
      final repo = RecordingAddresses();
      final container = (await tester.runAsync(() => _start(repo)))!;
      addTearDown(container.dispose);
      await tester.pumpWidget(_host(container));
      await _open(tester);
      await tester.enterText(find.byType(TextFormField).at(1), 'Baghdad');
      await _tap(tester, other);
      await _tap(tester, find.byKey(const ValueKey('phone-country-selector')));
      await tester.enterText(find.byType(TextField).last, 'United Kingdom');
      await tester.pumpAndSettle();
      await tester.tap(find.text('United Kingdom').last);
      await tester.pumpAndSettle();
      await tester.enterText(otherField, '02079460018');
      await _tap(tester, primary);
      await _tap(tester, other);
      expect(find.text('+44'), findsOneWidget);
      expect(
        tester.widget<TextFormField>(otherField).controller!.text,
        '02079460018',
      );
      await _save(tester);
      expect(repo.created.single.contactPhone, '+442079460018');
    },
  );

  testWidgets('remote mode accepts normalized international delivery contacts', (
    tester,
  ) async {
    // Use an explicitly remote configuration without issuing network requests.
    final repo = RecordingAddresses();
    final remote = ProviderContainer(
      overrides: [
        testGovernoratesOverride,
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
    await _tap(tester, other);
    final l10n = AppLocalizations.of(tester.element(otherField));
    final helper = find.text(l10n.addressInternationalPhoneHint);
    expect(
      tester.getRect(helper).top - tester.getRect(otherField).bottom,
      closeTo(AppSpacing.fieldHelperGap, .01),
    );
    await tester.enterText(otherField, '(+٩٦٤) ٧٨١ ٢٣٤-٥٦٧٨');
    await _save(tester);
    expect(repo.created.single.contactPhone, '+9647812345678');
    expect(find.byType(AddressFormScreen), findsNothing);
  });
}

class _PendingSaveAddresses extends RecordingAddresses {
  final pending = Completer<Address>();
  @override
  Future<Address> createAddress(AddressInput input) {
    created.add(input);
    return pending.future;
  }

  @override
  Future<Address> updateAddress(String id, AddressInput input) {
    updated.add(id);
    return pending.future;
  }
}
