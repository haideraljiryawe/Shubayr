import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/l10n_context.dart';
import '../../core/theme/theme_context.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';
import '../router/app_routes.dart';

/// A single navigation destination bound to a shell branch.
typedef _Destination = ({
  IconData icon,
  IconData selectedIcon,
  String label,
  bool guestVisible,
});

/// Customer navigation shell.
///
/// Adaptive by width: a bottom navigation bar on phones, a side rail on
/// tablets and the web. Both drive the same `StatefulNavigationShell`, so
/// there is no duplicated navigation logic between form factors.
///
/// Branch order matches `app_router.dart`: Home · Categories · Cart · Orders ·
/// Account. A signed-out guest sees only the three public destinations; Cart
/// and Orders appear once signed in.
class CustomerShell extends ConsumerWidget {
  const CustomerShell({super.key, required this.navigationShell});

  static const double railBreakpoint = 900;

  /// Branch index of the Account destination. Must match the branch order in
  /// `app_router.dart` and the destination order below.
  static const int accountBranchIndex = 4;

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final isSignedIn =
        ref.watch(sessionControllerProvider).valueOrNull?.isSignedIn ?? false;

    // Every destination, in branch order. In Arabic the first entry lays out on
    // the right automatically — the bar follows the ambient Directionality, so
    // no mirroring logic is needed here.
    final all = <_Destination>[
      (
        icon: Icons.home_outlined,
        selectedIcon: Icons.home,
        label: l10n.navHome,
        guestVisible: true,
      ),
      (
        icon: Icons.grid_view_outlined,
        selectedIcon: Icons.grid_view_rounded,
        label: l10n.navCategories,
        guestVisible: true,
      ),
      (
        icon: Icons.shopping_cart_outlined,
        selectedIcon: Icons.shopping_cart,
        label: l10n.navCart,
        guestVisible: false,
      ),
      (
        icon: Icons.receipt_long_outlined,
        selectedIcon: Icons.receipt_long,
        label: l10n.navOrders,
        guestVisible: false,
      ),
      (
        icon: Icons.person_outline,
        selectedIcon: Icons.person,
        label: l10n.navAccount,
        guestVisible: true,
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

    // A signed-out guest tapping Account gets sign-in pushed over the shell
    // rather than switching branch into a guarded route. That keeps real
    // navigation history, so Back returns to whatever they were browsing —
    // Home or Categories — instead of a hard-coded destination.
    void onSelect(int visibleIndex) {
      final branchIndex = visibleBranches[visibleIndex];
      if (!isSignedIn && branchIndex == accountBranchIndex) {
        context.pushNamed(AppRoutes.signInName);
        return;
      }
      navigationShell.goBranch(
        branchIndex,
        initialLocation: branchIndex == navigationShell.currentIndex,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final useRail = constraints.maxWidth >= railBreakpoint;

        if (useRail) {
          return Scaffold(
            body: Row(
              children: [
                NavigationRail(
                  selectedIndex: selectedIndex,
                  onDestinationSelected: onSelect,
                  labelType: NavigationRailLabelType.all,
                  destinations: [
                    for (final d in destinations)
                      NavigationRailDestination(
                        icon: Icon(d.icon),
                        selectedIcon: Icon(d.selectedIcon),
                        label: Text(d.label),
                      ),
                  ],
                ),
                VerticalDivider(width: 1, color: colors.divider),
                Expanded(child: navigationShell),
              ],
            ),
          );
        }

        return Scaffold(
          body: navigationShell,
          bottomNavigationBar: NavigationBar(
            selectedIndex: selectedIndex,
            onDestinationSelected: onSelect,
            destinations: [
              for (final d in destinations)
                NavigationDestination(
                  icon: Icon(d.icon),
                  selectedIcon: Icon(d.selectedIcon),
                  label: d.label,
                ),
            ],
          ),
        );
      },
    );
  }
}
