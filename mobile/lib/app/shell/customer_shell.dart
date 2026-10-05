import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/l10n_context.dart';
import '../../core/layout/app_layout.dart';
import 'customer_bottom_navigation.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';
import '../../features/cart/presentation/providers/cart_providers.dart';

enum _DestinationId { home, categories, cart, orders, account }

/// A single navigation destination bound to a shell branch.
typedef _Destination = ({
  _DestinationId id,
  IconData icon,
  IconData selectedIcon,
  String label,
  bool guestVisible,
  // Count shown as a badge on the icon (0 = none). Only the cart uses it.
  int badge,
});

/// Customer navigation shell.
///
/// One bottom navigation bar across window sizes, driving the same shell.
///
/// Branch order matches `app_router.dart`: Home · Categories · Cart · Orders ·
/// Account. A signed-out guest sees only the three public destinations; Cart
/// and Orders appear once signed in.
class CustomerShell extends ConsumerWidget {
  const CustomerShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // An exiting route must release the globally keyed navigation shell before
    // a replacement route mounts it.
    // Keep covered (still active) routes intact, including pushed sign-in.
    if (ModalRoute.of(context)?.isActive == false) {
      return const SizedBox.shrink();
    }
    final l10n = context.l10n;
    final isSignedIn =
        ref.watch(sessionControllerProvider).value?.isSignedIn ?? false;

    // Cart badge counts distinct products (lines), not total units — rebuilds
    // the bar only when a line is added or removed.
    final cartCount = ref.watch(
      cartControllerProvider.select((c) => c.value?.items.length ?? 0),
    );

    // Every destination, in branch order. In Arabic the first entry lays out on
    // the right automatically — the bar follows the ambient Directionality, so
    // no mirroring logic is needed here.
    final all = <_Destination>[
      (
        id: _DestinationId.home,
        icon: Icons.home_outlined,
        selectedIcon: Icons.home,
        label: l10n.navHome,
        guestVisible: true,
        badge: 0,
      ),
      (
        id: _DestinationId.categories,
        icon: Icons.grid_view_outlined,
        selectedIcon: Icons.grid_view_rounded,
        label: l10n.navCategories,
        guestVisible: true,
        badge: 0,
      ),
      (
        id: _DestinationId.cart,
        icon: Icons.shopping_cart_outlined,
        selectedIcon: Icons.shopping_cart,
        label: l10n.navCart,
        guestVisible: false,
        badge: cartCount,
      ),
      (
        id: _DestinationId.orders,
        icon: Icons.receipt_long_outlined,
        selectedIcon: Icons.receipt_long,
        label: l10n.navOrders,
        guestVisible: false,
        badge: 0,
      ),
      (
        id: _DestinationId.account,
        icon: Icons.person_outline,
        selectedIcon: Icons.person,
        label: l10n.navAccount,
        guestVisible: true,
        badge: 0,
      ),
    ];

    // Branch indices shown for the current auth state, in bar order.
    final visibleBranches = <int>[
      for (var i = 0; i < all.length; i++)
        if (isSignedIn || all[i].guestVisible) i,
    ];
    final destinations = [for (final i in visibleBranches) all[i]];

    // Map the shell's active branch to the selected tab in the visible list.
    final selectedIndex = visibleBranches
        .indexOf(navigationShell.currentIndex)
        .clamp(0, destinations.length - 1);

    // Every visible destination is a plain tab switch. Account is public — for
    // a guest it shows the app-settings screen with a sign-in prompt inside, so
    // there is no longer a special case that pushes sign-in from the bar.
    void onSelect(int visibleIndex) {
      final branchIndex = visibleBranches[visibleIndex];
      navigationShell.goBranch(
        branchIndex,
        initialLocation: branchIndex == navigationShell.currentIndex,
      );
    }

    return Scaffold(
      extendBody: true,
      body: Builder(
        builder: (context) => BottomNavigationInset(
          bottom: MediaQuery.paddingOf(context).bottom,
          child: navigationShell,
        ),
      ),
      bottomNavigationBar: CustomerBottomNavigation(
        destinations: [
          for (final destination in destinations)
            (
              id: destination.id,
              icon: destination.icon,
              selectedIcon: destination.selectedIcon,
              label: destination.label,
              badge: destination.badge,
            ),
        ],
        selectedIndex: selectedIndex,
        onSelected: onSelect,
      ),
    );
  }
}
