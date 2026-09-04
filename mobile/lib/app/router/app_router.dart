import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/l10n_context.dart';
import '../../core/widgets/state_views.dart';
import '../../features/admin/presentation/screens/admin_home_screen.dart';
import '../../features/auth/domain/user_role.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';
import '../../features/auth/presentation/screens/sign_in_screen.dart';
import '../../features/auth/presentation/screens/verify_otp_screen.dart';
import '../../features/cart/presentation/screens/cart_screen.dart';
import '../../features/catalog/presentation/screens/categories_screen.dart';
import '../../features/catalog/presentation/screens/home_screen.dart';
import '../../features/delivery/presentation/screens/delivery_home_screen.dart';
import '../../features/orders/presentation/screens/orders_screen.dart';
import '../../features/settings/presentation/screens/account_screen.dart';
import '../shell/customer_shell.dart';
import '../splash_screen.dart';
import 'app_routes.dart';
import 'role_guard.dart';

final routerProvider = Provider<GoRouter>((ref) {
  // Bridges Riverpod state changes to go_router's refresh mechanism.
  final refresh = ValueNotifier<int>(0);
  ref
    ..listen(sessionControllerProvider, (_, _) => refresh.value++)
    ..onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
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
      // Customer shell. The branches are the guest (signed-out) destinations:
      // Home · Categories · Account. Navigation for authenticated customers
      // and for the delivery/staff roles is not designed yet.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            CustomerShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.home,
                name: AppRoutes.homeName,
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.categories,
                name: AppRoutes.categoriesName,
                builder: (context, state) => const CategoriesScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
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

      // Reachable by path and still covered by the role guard, but not part of
      // the guest tab bar. They move into a shell branch when the authenticated
      // customer navigation is designed.
      GoRoute(
        path: AppRoutes.cart,
        name: AppRoutes.cartName,
        builder: (context, state) => const CartScreen(),
      ),
      GoRoute(
        path: AppRoutes.orders,
        name: AppRoutes.ordersName,
        builder: (context, state) => const OrdersScreen(),
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
    ],
  );
});
