import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n/l10n_context.dart';
import '../../core/theme/theme_context.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';
import '../router/app_routes.dart';

/// Customer navigation shell.
///
/// Adaptive by width: a bottom navigation bar on phones, a side rail on
/// tablets and the web. Both drive the same `StatefulNavigationShell`, so
/// there is no duplicated navigation logic between form factors.
class CustomerShell extends ConsumerWidget {
  const CustomerShell({super.key, required this.navigationShell});

  static const double railBreakpoint = 900;

  /// Index of the Account destination. Must match the branch order in
  /// `app_router.dart` and the destination order below.
  static const int accountBranchIndex = 2;

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final isSignedIn =
        ref.watch(sessionControllerProvider).valueOrNull?.isSignedIn ?? false;

    // A signed-out guest tapping Account gets sign-in pushed over the shell
    // rather than switching branch into a guarded route. That keeps real
    // navigation history, so Back returns to whatever they were browsing —
    // Home or Categories — instead of a hard-coded destination.
    void goToBranch(int index) {
      if (!isSignedIn && index == accountBranchIndex) {
        context.pushNamed(AppRoutes.signInName);
        return;
      }
      navigationShell.goBranch(
        index,
        initialLocation: index == navigationShell.currentIndex,
      );
    }

    // Guest (signed-out) destinations, in branch order. In Arabic the first
    // entry lays out on the right automatically — the bar follows the ambient
    // Directionality, so no mirroring logic is needed here.
    //
    // Navigation for authenticated customers and for the delivery/staff roles
    // is not designed yet; this list is the guest set only.
    final destinations =
        <({IconData icon, IconData selectedIcon, String label})>[
          (
            icon: Icons.home_outlined,
            selectedIcon: Icons.home,
            label: l10n.navHome,
          ),
          (
            icon: Icons.grid_view_outlined,
            selectedIcon: Icons.grid_view_rounded,
            label: l10n.navCategories,
          ),
          (
            icon: Icons.person_outline,
            selectedIcon: Icons.person,
            label: l10n.navAccount,
          ),
        ];

    return LayoutBuilder(
      builder: (context, constraints) {
        final useRail = constraints.maxWidth >= railBreakpoint;

        if (useRail) {
          return Scaffold(
            body: Row(
              children: [
                NavigationRail(
                  selectedIndex: navigationShell.currentIndex,
                  onDestinationSelected: goToBranch,
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
            selectedIndex: navigationShell.currentIndex,
            onDestinationSelected: goToBranch,
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
