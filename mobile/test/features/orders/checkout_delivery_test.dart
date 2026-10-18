import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/core/storage/pending_request_store.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/data/address_repository_remote.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/cart/data/cart_repository_remote.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/orders/presentation/providers/checkout_pricing_provider.dart';
import 'package:shubayr/features/orders/presentation/screens/checkout_screen.dart';
import '../../helpers/test_session.dart';

const served = Address(id: 'a', city: 'Kut', governorateId: 'wasit');
const legacy = Address(id: 'a', city: 'Kut');
const base = Cart(
  items: [
    CartItem(
      id: 'line',
      productId: 'p',
      available: true,
      currency: 'IQD',
      unitPrice: 10000,
      lineTotal: 10000,
      availableQty: 10,
      currentUnitPrice: 10000,
      priceVersion: 'v1',
      currentPriceVersion: 'v1',
    ),
  ],
  subtotal: 10000,
  total: 10000,
  currency: 'IQD',
);
final quote = Cart(
  items: base.items,
  subtotal: 10000,
  deliveryFee: 5000,
  total: 15000,
  currency: 'IQD',
);

class QuoteCart extends CartRepositoryMock {
  final requests = <String?>[];
  Future<Cart> Function(String)? onQuote;
  @override
  Future<Cart> fetchCart({String? addressId}) async {
    requests.add(addressId);
    return addressId == null
        ? base
        : await (onQuote?.call(addressId) ?? Future.value(quote));
  }
}

class FixedAddresses extends AddressesController {
  FixedAddresses(this.address);
  final Address address;
  @override
  Future<List<Address>> build() async => [address];
}

ProviderContainer setup(QuoteCart cart, {Address address = served}) =>
    ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        brandProvider.overrideWithValue(const Brand.bundled()),
        pendingRequestStoreProvider.overrideWithValue(
          PendingRequestStore.memory(),
        ),
        sessionControllerProvider.overrideWith(TestSession.new),
        cartRepositoryProvider.overrideWithValue(cart),
        addressesControllerProvider.overrideWith(() => FixedAddresses(address)),
      ],
    );
Widget host(ProviderContainer c) => UncontrolledProviderScope(
  container: c,
  child: MaterialApp(
    locale: const Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: const CheckoutScreen(),
  ),
);

void main() {
  test(
    'address governorate survives reads, defaults and explicit patch; create requires selection',
    () async {
      final address = Address.fromJson({
        'id': 'a',
        'city': 'Kut',
        'contact_phone': '+9647701234567',
        'governorate_id': 'wasit',
      });
      expect(
        address.withDefault(true).toInput().toJson()['governorate_id'],
        'wasit',
      );
      RequestOptions? request;
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              request = options;
              handler.resolve(
                Response(
                  requestOptions: options,
                  data: {'id': 'a', ...options.data as Map<String, dynamic>},
                  statusCode: 200,
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final repository = AddressRepositoryRemote(ApiClient(dio));
      await repository.updateAddress('a', address.toInput());
      expect(request!.data['governorate_id'], 'wasit');
      request = null;
      await expectLater(
        repository.createAddress(
          const AddressInput(city: 'Kut', contactPhone: '+9647701234567'),
        ),
        throwsA(
          isA<AppFailure>().having(
            (e) => e.code,
            'code',
            'ADDRESS_GOVERNORATE_REQUIRED',
          ),
        ),
      );
      expect(request, isNull);
      expect(legacy.governorateId, isNull);
    },
  );

  test(
    'remote cart pricing sends only address_id and preserves server totals',
    () async {
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              expect(options.path, '/cart');
              expect(options.queryParameters, {'address_id': 'a'});
              handler.resolve(
                Response(
                  requestOptions: options,
                  data: quote.toJson(),
                  statusCode: 200,
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final result = await CartRepositoryRemote(
        ApiClient(dio),
      ).fetchCart(addressId: 'a');
      expect(result.total, 15000);
      expect(result.deliveryFee, 5000);
    },
  );

  testWidgets('legacy address shows repair reason and cannot place an order', (
    tester,
  ) async {
    final cart = QuoteCart();
    final c = setup(cart, address: legacy);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();
    expect(find.text('Edit address'), findsOneWidget);
    expect(find.textContaining('Select a governorate'), findsOneWidget);
    expect(find.text('Place order'), findsNothing);
    expect(cart.requests.whereType<String>(), isEmpty);
  });

  testWidgets(
    'unserved zone keeps the server refusal and never shows free delivery',
    (tester) async {
      final cart = QuoteCart()
        ..onQuote = (_) async => throw const AppFailure(
          FailureKind.conflict,
          code: 'DELIVERY_ZONE_NOT_SERVED',
        );
      final c = setup(cart);
      addTearDown(c.dispose);
      await tester.pumpWidget(host(c));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Delivery is currently unavailable'),
        findsOneWidget,
      );
      expect(find.text('Place order'), findsNothing);
    },
  );

  testWidgets(
    'placement waits for the address quote and shows its authoritative total',
    (tester) async {
      final pending = Completer<Cart>();
      final cart = QuoteCart()..onQuote = (_) => pending.future;
      final c = setup(cart);
      addTearDown(c.dispose);
      await tester.pumpWidget(host(c));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Place order'), findsNothing);
      pending.complete(quote);
      await tester.pumpAndSettle();
      expect(cart.requests, contains('a'));
      expect(find.textContaining('15,000'), findsWidgets);
      expect(find.text('Place order'), findsOneWidget);
    },
  );

  testWidgets('a fresh quote with an unavailable item cannot place an order', (
    tester,
  ) async {
    final cart = QuoteCart()
      ..onQuote = (_) async => const Cart(
        items: [CartItem(id: 'line', productId: 'p', available: false)],
        subtotal: 10000,
        deliveryFee: 5000,
        total: 15000,
        currency: 'IQD',
      );
    final c = setup(cart);
    addTearDown(c.dispose);
    await tester.pumpWidget(host(c));
    await tester.pumpAndSettle();
    final button = tester.widget<ElevatedButton>(
      find.widgetWithText(ElevatedButton, 'Place order'),
    );
    expect(button.onPressed, isNull);
  });

  test('address-scoped quotes discard an obsolete in-flight result', () async {
    final pending = Completer<Cart>();
    final cart = QuoteCart()
      ..onQuote = (id) => id == 'a' ? pending.future : Future.value(quote);
    final c = setup(cart);
    addTearDown(c.dispose);
    await c.read(sessionControllerProvider.future);
    await c.read(cartControllerProvider.future);
    final old = c.listen(checkoutPricingProvider(served), (_, _) {});
    await Future<void>.delayed(Duration.zero);
    old.close();
    const newer = Address(id: 'b', city: 'Kut', governorateId: 'wasit');
    final current = c.listen(checkoutPricingProvider(newer), (_, _) {});
    addTearDown(current.close);
    expect((await c.read(checkoutPricingProvider(newer).future)).total, 15000);
    pending.complete(base);
    await Future<void>.delayed(Duration.zero);
    expect(c.read(checkoutPricingProvider(newer)).requireValue.total, 15000);
  });
}
