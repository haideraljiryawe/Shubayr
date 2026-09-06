import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/l10n_context.dart';
import '../../core/widgets/state_views.dart';
import '../../features/address/data/address.dart';
import '../../features/address/presentation/screens/address_form_screen.dart';
import '../../features/address/presentation/screens/addresses_screen.dart';
import '../../features/admin/presentation/screens/admin_home_screen.dart';
import '../../features/orders/presentation/screens/checkout_screen.dart';
import '../../features/orders/presentation/screens/order_detail_screen.dart';
import '../../features/dev/presentation/screens/design_gallery_screen.dart';
import '../../features/auth/domain/user_role.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';
import '../../features/auth/presentation/screens/sign_in_screen.dart';
import '../../features/auth/presentation/screens/verify_otp_screen.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/catalog/presentation/screens/categories_screen.dart';
import '../../features/catalog/presentation/screens/home_screen.dart';
import '../../features/catalog/presentation/screens/product_detail_screen.dart';
import '../../features/catalog/presentation/screens/product_list_screen.dart';
import '../../features/catalog/presentation/providers/product_list_controller.dart';
import '../../features/delivery/presentation/screens/delivery_home_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/settings/presentation/screens/account_screen.dart';
import '../../features/settings/presentation/screens/profile_screen.dart';
import '../shell/customer_shell.dart';
import '../splash_screen.dart';
import 'app_routes.dart';
import 'role_guard.dart';

// Stable navigator keys. Without them go_router derives branch navigator keys
// implicitly; when `refreshListenable` fires mid-transition (e.g. the session
// flips to signed-in while the sign-in route is on top), the shell can be
// rebuilt with a fresh key while the old one is still mounted, tripping
// Navigator's duplicate-page-key assertion. Fixed keys keep each navigator's
// identity stable across those rebuilds.
final _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final _homeBranchKey = GlobalKey<NavigatorState>(debugLabel: 'branch-home');
final _categoriesBranchKey = GlobalKey<NavigatorState>(
  debugLabel: 'branch-categories',
);
final _cartBranchKey = GlobalKey<NavigatorState>(debugLabel: 'branch-cart');
final _ordersBranchKey = GlobalKey<NavigatorState>(debugLabel: 'branch-orders');
final _accountBranchKey = GlobalKey<NavigatorState>(debugLabel: 'branch-account');

final routerProvider = Provider<GoRouter>((ref) {
  // Bridges Riverpod state changes to go_router's refresh mechanism. Only
  // routing-relevant changes (restore state, signed-in status, role) trigger a
  // refresh — editing the profile name must not rebuild the navigator while a
  // route like /profile is pushed over the shell.
  final refresh = ValueNotifier<int>(0);
  ref
    ..listen(
      sessionControllerProvider.select(
        (s) => (s.isLoading, s.valueOrNull?.isSignedIn ?? false, s.valueOrNull?.role),
      ),
      (_, _) => refresh.value++,
    )
    ..onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      // The design gallery is a developer tool: reachable in debug builds only,
      // and outside the role rules (which stay a pure, production concern).
      if (kDebugMode && state.matchedLocation.startsWith(AppRoutes.design)) {
        return null;
      }
      final session = ref.read(sessionControllerProvider);
      final status = switch (session) {
        AsyncLoading() => SessionStatus.restoring,
        AsyncData(:final value) when value.isSignedIn => SessionStatus.signedIn,
        _ => SessionStatus.signedOut,
      };
      return RoleGuard.redirect(
        status: status,
        role: session.valueOrNull?.role ?? UserRole.customer,
        location: state.matchedLocation,
      );
    },
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: Text(context.l10n.routeNotFoundTitle)),
      body: AppEmptyView(
        icon: Icons.explore_off_outlined,
        title: context.l10n.routeNotFoundTitle,
        message: state.uri.toString(),
      ),
    ),
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.signIn,
        name: AppRoutes.signInName,
        // Full-screen over the shell: pin it to the root navigator so a guest
        // tapping Account pushes it above the tab bar (not inside the active
        // branch). Pushing into a branch and then redirecting back to that
        // branch on sign-in produced two shell matches with the same page key.
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const SignInScreen(),
        routes: [
          GoRoute(
            path: 'verify',
            name: AppRoutes.verifyOtpName,
            builder: (context, state) => VerifyOtpScreen(
              phone: state.uri.queryParameters['phone'] ?? '',
            ),
          ),
        ],
      ),
      // Customer shell. Branch order is fixed: Home · Categories · Cart ·
      // Orders · Account. A signed-out guest sees only Home · Categories ·
      // Account (Cart and Orders are guarded); CustomerShell hides those two
      // destinations and maps the visible tabs back to these branch indices.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            CustomerShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            navigatorKey: _homeBranchKey,
            routes: [
              GoRoute(
                path: AppRoutes.home,
                name: AppRoutes.homeName,
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _categoriesBranchKey,
            routes: [
              GoRoute(
                path: AppRoutes.categories,
                name: AppRoutes.categoriesName,
                builder: (context, state) => const CategoriesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _cartBranchKey,
            routes: [
              GoRoute(
                path: AppRoutes.cart,
                name: AppRoutes.cartName,
                builder: (context, state) => const CartScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _ordersBranchKey,
            routes: [
              GoRoute(
                path: AppRoutes.orders,
                name: AppRoutes.ordersName,
                builder: (context, state) => const OrdersScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _accountBranchKey,
            routes: [
              GoRoute(
                path: AppRoutes.account,
                name: AppRoutes.accountName,
                builder: (context, state) => const AccountScreen(),
              ),
            ],
          ),
        ],
      ),

      // Product detail — full-screen over the shell (keeps the tab bar behind
      // it in history), reachable from any catalog surface.
      GoRoute(
        path: AppRoutes.product,
        name: AppRoutes.productName,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) =>
            ProductDetailScreen(productId: state.pathParameters['id']!),
      ),

      // Product search / listing. Seeds the initial filter from query params
      // (?q=…&category_id=…), then the screen drives search/sort/filters.
      GoRoute(
        path: AppRoutes.search,
        name: AppRoutes.searchName,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => ProductListScreen(
          initialQuery: ProductQuery(
            text: state.uri.queryParameters['q'] ?? '',
            categoryId: state.uri.queryParameters['category_id'],
          ),
        ),
      ),

      // Shared full-screen pages any signed-in role reaches with a back button:
      // the account-settings page (staff/delivery open it here) and the profile
      // editor (reached from the account/profile row).
      GoRoute(
        path: AppRoutes.settings,
        name: AppRoutes.settingsName,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const AccountScreen(),
      ),
      GoRoute(
        path: AppRoutes.profile,
        name: AppRoutes.profileName,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: AppRoutes.addresses,
        name: AppRoutes.addressesName,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const AddressesScreen(),
      ),
      GoRoute(
        path: AppRoutes.addressForm,
        name: AppRoutes.addressFormName,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) =>
            AddressFormScreen(address: state.extra as Address?),
      ),
      GoRoute(
        path: AppRoutes.checkout,
        name: AppRoutes.checkoutName,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) => const CheckoutScreen(),
      ),
      // A single order's details + tracking — full-screen over the shell,
      // reached from the orders tab (matches the product-detail pattern).
      GoRoute(
        path: AppRoutes.orderDetail,
        name: AppRoutes.orderDetailName,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (context, state) =>
            OrderDetailScreen(orderId: state.pathParameters['id']!),
      ),

      GoRoute(
        path: AppRoutes.delivery,
        name: AppRoutes.deliveryName,
        builder: (context, state) => const DeliveryHomeScreen(),
      ),
      GoRoute(
        path: AppRoutes.admin,
        name: AppRoutes.adminName,
        builder: (context, state) => const AdminHomeScreen(),
      ),

      // Developer-only design gallery. The redirect above only lets this
      // through in debug builds.
      GoRoute(
        path: AppRoutes.design,
        name: AppRoutes.designName,
        builder: (context, state) => const DesignGalleryScreen(),
      ),
    ],
  );
});
