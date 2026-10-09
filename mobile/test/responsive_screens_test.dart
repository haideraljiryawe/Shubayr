import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/core/config/app_config.dart';
import 'helpers/test_session.dart';
import 'package:shubayr/features/banners/data/home_banner.dart';
import 'package:shubayr/features/banners/presentation/providers/banner_providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/storage/prefs_store.dart';
import 'package:shubayr/core/storage/token_store.dart';
import 'package:shubayr/core/widgets/skeleton.dart';
import 'package:shubayr/core/widgets/app_card.dart';
import 'package:shubayr/core/widgets/state_views.dart';
import 'package:shubayr/features/catalog/presentation/widgets/product_card.dart';
import 'package:shubayr/features/wishlist/presentation/screens/wishlist_screen.dart';
import 'package:shubayr/features/auth/presentation/screens/sign_in_screen.dart';
import 'package:shubayr/features/auth/presentation/screens/verify_otp_screen.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart_repository_mock.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/orders/data/order_repository_mock.dart';
import 'package:shubayr/features/orders/presentation/providers/order_providers.dart';
import 'package:shubayr/features/settings/presentation/providers/settings_providers.dart';
import 'package:shubayr/features/address/presentation/providers/address_providers.dart';
import 'package:shubayr/features/delivery/presentation/providers/delivery_providers.dart';
import 'package:shubayr/features/address/presentation/screens/address_form_screen.dart';
import 'package:shubayr/features/address/presentation/screens/addresses_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/home_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/categories_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_list_screen.dart';
import 'package:shubayr/features/catalog/presentation/screens/product_detail_screen.dart';
import 'package:shubayr/features/orders/presentation/screens/orders_screen.dart';
import 'package:shubayr/features/orders/presentation/screens/checkout_screen.dart';
import 'package:shubayr/features/orders/presentation/screens/order_detail_screen.dart';
import 'package:shubayr/features/orders/presentation/screens/after_sales_screens.dart';
import 'package:shubayr/features/cart/presentation/screens/cart_screen.dart';
import 'package:shubayr/features/settings/presentation/screens/profile_screen.dart';
import 'package:shubayr/features/settings/presentation/screens/account_view.dart';
import 'package:shubayr/features/delivery/presentation/screens/delivery_home_screen.dart';
import 'core/layout/app_layout_test.dart' show responsiveWidths;
import 'features/address/support/address_fakes.dart';
import 'features/delivery/support/delivery_fakes.dart';

class _Catalog extends CatalogRepositoryMock {
  _Catalog() : super(delay: Duration.zero);
  Product stripImages(Product p) =>
      Product.fromJson({...p.toJson(), 'images': <String>[]});
  @override
  Future<Product> fetchProduct(String id) async =>
      stripImages(await super.fetchProduct(id));
  @override
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    bool onSale = false,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) async {
    final p = await super.fetchProducts(
      query: query,
      categoryId: categoryId,
      minPrice: minPrice,
      maxPrice: maxPrice,
      sort: sort,
      onSale: onSale,
      page: page,
      perPage: perPage,
    );
    return ProductPage(
      page: p.page,
      perPage: p.perPage,
      total: p.total,
      data: p.data.map(stripImages).toList(),
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late PrefsStore prefs;
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = PrefsStore(await SharedPreferences.getInstance());
    await (FontLoader('Zain')
          ..addFont(rootBundle.load('assets/fonts/Zain-Regular.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Zain-Bold.ttf'))
          ..addFont(rootBundle.load('assets/fonts/Zain-ExtraBold.ttf')))
        .load();
  });
  for (final (locale, dark) in [('ar', false), ('en', true)]) {
    for (final (width, scale) in [
      for (final width in responsiveWidths) (width, 1.0),
      for (final width in <double>[390, 600, 900, 1200, 1920]) (width, 2.0),
    ]) {
      testWidgets('current screens fit $width $locale dark=$dark scale=$scale', (
        tester,
      ) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.binding.setSurfaceSize(Size(width, 1000));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final cart = CartRepositoryMock(delay: Duration.zero);
        await tester.runAsync(
          () => cart.addItem(
            idempotencyKey: 'test-add-key-0',
            productId: 'p1',
            quantity: 2,
          ),
        );
        for (final screen in <Widget>[
          const AddressFormScreen(),
          const AddressesScreen(),
          const WishlistScreen(),
          const SignInScreen(),
          const VerifyOtpScreen(phone: '07701234567'),
          const DeliveryHomeScreen(),
          const HomeScreen(),
          const CategoriesScreen(),
          const ProductListScreen(),
          const ProductDetailScreen(productId: 'p1'),
          const OrdersScreen(),
          const OrderDetailScreen(orderId: 'order-1042'),
          const CartScreen(),
          const CheckoutScreen(),
          const ReviewOrderScreen(orderId: 'order-1042'),
          const ReturnOrderScreen(orderId: 'order-1042'),
          const Scaffold(body: AccountView()),
          const ProfileScreen(),
        ]) {
          await tester.pumpWidget(
            ProviderScope(
              retry: (retryCount, error) => null,
              key: UniqueKey(),
              overrides: [
                notificationSyncProvider.overrideWith((ref) {}),
                unreadCountProvider.overrideWith((ref) async => 0),
                dataSourceProvider.overrideWithValue(DataSource.mock),
                prefsStoreProvider.overrideWithValue(prefs),
                tokenStoreProvider.overrideWithValue(InMemoryTokenStore()),
                sessionControllerProvider.overrideWith(
                  () => TestSession(
                    initial: screen is DeliveryHomeScreen
                        ? agentSession
                        : customerSession,
                  ),
                ),
                brandProvider.overrideWithValue(const Brand.bundled()),
                homeBannersProvider.overrideWith(
                  (ref) async => const [
                    HomeBanner(
                      id: 'test-banner',
                      title: 'بانر المتجر Store banner',
                      imageUrl: '',
                    ),
                  ],
                ),
                cartRepositoryProvider.overrideWithValue(cart),
                catalogRepositoryProvider.overrideWithValue(_Catalog()),
                orderRepositoryProvider.overrideWithValue(
                  OrderRepositoryMock(cart, delay: Duration.zero),
                ),
                addressRepositoryProvider.overrideWithValue(
                  RecordingAddresses(),
                ),
                deliveryRepositoryProvider.overrideWithValue(
                  RecordingDeliveries(),
                ),
              ],
              child: MaterialApp(
                locale: Locale(locale),
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                theme: dark
                    ? AppTheme.dark(const Brand.bundled())
                    : AppTheme.light(const Brand.bundled()),
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: TextScaler.linear(scale),
                    disableAnimations: true,
                  ),
                  child: child!,
                ),
                home: screen,
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: '$screen at $width');
          expect(
            find.byType(Skeleton),
            findsNothing,
            reason: '$screen must load',
          );
          expect(
            find.byType(AppErrorView),
            findsNothing,
            reason: '$screen must show data',
          );
          final l10n = AppLocalizations.of(
            tester.element(find.byType(Scaffold).first),
          );
          final sectionLabels = switch (screen) {
            CheckoutScreen() => [
              l10n.checkoutAddress,
              l10n.checkoutCoupon,
              l10n.checkoutPayment,
            ],
            OrderDetailScreen() => [
              l10n.orderTrackingTitle,
              l10n.orderItemsSection,
              l10n.orderSummary,
            ],
            Scaffold(body: AccountView()) => [
              l10n.accountPreferences,
              l10n.accountSupport,
            ],
            _ => <String>[],
          };
          for (final label in sectionLabels) {
            final heading = tester.widget<Text>(find.text(label));
            expect(heading.style!.fontFamily, 'Zain');
            expect(heading.style!.fontSize, 16);
            expect(heading.style!.fontWeight, FontWeight.w700);
          }
          final scaffold = tester.widget<Scaffold>(find.byType(Scaffold).first);
          if (screen is CheckoutScreen ||
              screen is CartScreen ||
              screen is ProductDetailScreen) {
            expect(
              tester.getSize(find.byWidget(scaffold.body!)).height,
              greaterThan(300),
              reason: '$screen body must remain visible above actions',
            );
          }
          if (scale == 1 &&
              width >= 900 &&
              (screen is OrdersScreen ||
                  screen is DeliveryHomeScreen ||
                  screen is AddressesScreen)) {
            final cards = find.byType(AppCard);
            expect(cards.evaluate().length, greaterThan(1));
            expect(
              tester.getTopLeft(cards.at(0)).dy,
              tester.getTopLeft(cards.at(1)).dy,
              reason: '$screen must actually use adjacent cards',
            );
            expect(tester.getSize(cards.first).width, lessThan(width / 2));
          }
          if (scale == 1 &&
              width >= 900 &&
              (screen is HomeScreen ||
                  screen is ProductListScreen ||
                  screen is WishlistScreen)) {
            final cards = find.byType(ProductCard);
            expect(cards.evaluate().length, greaterThan(2));
            expect(tester.getSize(cards.first).width, lessThan(300));
          }

          // Exercise lower fields, actions and content, not only the first viewport.
          final vertical = find.byWidgetPredicate(
            (w) =>
                w is Scrollable &&
                axisDirectionToAxis(w.axisDirection) == Axis.vertical,
          );
          if (vertical.evaluate().isNotEmpty) {
            final state = tester.state<ScrollableState>(vertical.first);
            state.position.jumpTo(state.position.maxScrollExtent);
            await tester.pumpAndSettle();
            expect(
              tester.takeException(),
              isNull,
              reason: '$screen lower content at $width',
            );
          }
          await tester.pumpWidget(const SizedBox.shrink());
        }
      });
    }
  }
}
