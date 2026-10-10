import 'package:flutter/services.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/address/presentation/screens/addresses_screen.dart';

/// A controller pinned to a fixed list (no session / repository needed).
class _FixedAddresses extends AddressesController {
  _FixedAddresses(this._list);
  final List<Address> _list;
  @override
  Future<List<Address>> build() async => _list;
}

Widget _host(
  List<Address> list, {
  String language = 'en',
  bool dark = false,
  double scale = 1,
}) => ProviderScope(
  retry: (retryCount, error) => null,
  overrides: [
    notificationSyncProvider.overrideWith((ref) {}),
    unreadCountProvider.overrideWith((ref) async => 0),
    dataSourceProvider.overrideWithValue(DataSource.mock),
    addressesControllerProvider.overrideWith(() => _FixedAddresses(list)),
  ],
  child: MaterialApp(
    theme: dark
        ? AppTheme.dark(const Brand.bundled())
        : AppTheme.light(const Brand.bundled()),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(scale)),
      child: child!,
    ),
    locale: Locale(language),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: AddressesScreen(),
  ),
);

void main() {
  setUpAll(() async {
    final fonts = FontLoader('Zain');
    for (final weight in ['Regular', 'Bold', 'ExtraBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Zain-$weight.ttf'));
    }
    await fonts.load();
  });
  for (final language in ['ar', 'en']) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
          'address hierarchy remains readable at 320px $language dark=$dark scale=$scale',
          (tester) async {
            tester.view.physicalSize = const Size(320, 1000);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            await tester.pumpWidget(
              _host(
                const [
                  Address(
                    id: 'a1',
                    label: 'المنزل Home',
                    city: 'بغداد Baghdad',
                    area: 'الكرادة',
                    details: 'قرب السوق',
                    contactPhone: '07701234567',
                    isDefault: true,
                  ),
                ],
                language: language,
                dark: dark,
                scale: scale,
              ),
            );
            await tester.pumpAndSettle();
            for (final (finder, size, weight) in [
              (find.text('المنزل Home'), 16, FontWeight.w700),
              (find.textContaining('بغداد Baghdad'), 14, FontWeight.w400),
              (find.text('07701234567'), 14, FontWeight.w400),
              (
                find.text(language == 'ar' ? 'افتراضي' : 'Default'),
                12,
                FontWeight.w700,
              ),
            ]) {
              final style = tester.widget<Text>(finder).style!;
              expect(style.fontFamily, 'Zain');
              expect(style.fontSize, size);
              expect(style.fontWeight, weight);
            }
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }

  testWidgets('lists addresses with the default badge', (tester) async {
    await tester.pumpWidget(
      _host(const [
        Address(
          id: 'a1',
          label: 'المنزل',
          city: 'بغداد',
          area: 'الكرادة',
          isDefault: true,
        ),
      ]),
    );
    await tester.pumpAndSettle();

    expect(find.text('المنزل'), findsOneWidget);
    expect(find.text('Default'), findsOneWidget);
    expect(find.textContaining('بغداد'), findsOneWidget);
  });

  testWidgets('shows the empty state with no addresses', (tester) async {
    await tester.pumpWidget(_host(const []));
    await tester.pumpAndSettle();

    expect(find.text('No saved addresses'), findsOneWidget);
  });
}
