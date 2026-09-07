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

Widget _host(List<Address> list) => ProviderScope(
  overrides: [
    addressesControllerProvider.overrideWith(() => _FixedAddresses(list)),
  ],
  child: const MaterialApp(
    locale: Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: AddressesScreen(),
  ),
);

void main() {
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
