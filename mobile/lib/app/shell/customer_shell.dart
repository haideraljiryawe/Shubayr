import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/layout/app_layout.dart';
import '../../core/l10n/l10n_context.dart';
import '../../core/theme/components/navigation_themes.dart';
import '../../core/theme/theme_context.dart';
import '../../core/theme/tokens/app_motion.dart';
import '../../core/theme/tokens/app_radii.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';
import '../../features/cart/presentation/providers/cart_providers.dart';

/// A single navigation destination bound to a shell branch.
typedef _Destination = ({
  IconData icon,
  IconData selectedIcon,
  String label,
  bool guestVisible,
  // Count shown as a badge on the icon (0 = none). Only the cart uses it.
  int badge,
});

/// Wraps a destination's icon in a count badge (Material's standard, RTL-aware
/// [Badge]). The amber accent reads on both the muted and active icon states.
Widget _badged(BuildContext context, Widget child, int count) {
  if (count <= 0) return child;
  final colors = context.colors;
  return Badge(
    label: Text('$count'),
    backgroundColor: colors.accent,
    textColor: colors.onAccent,
    child: child,
  );
}

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

  static const double railBreakpoint = AppBreakpoints.compactDesktop;

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
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
        icon: Icons.home_outlined,
        selectedIcon: Icons.home,
        label: l10n.navHome,
        guestVisible: true,
        badge: 0,
      ),
      (
        icon: Icons.grid_view_outlined,
        selectedIcon: Icons.grid_view_rounded,
        label: l10n.navCategories,
        guestVisible: true,
        badge: 0,
      ),
      (
        icon: Icons.shopping_cart_outlined,
        selectedIcon: Icons.shopping_cart,
        label: l10n.navCart,
        guestVisible: false,
        badge: cartCount,
      ),
      (
        icon: Icons.receipt_long_outlined,
        selectedIcon: Icons.receipt_long,
        label: l10n.navOrders,
        guestVisible: false,
        badge: 0,
      ),
      (
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
                        icon: _badged(context, Icon(d.icon), d.badge),
                        selectedIcon: _badged(
                          context,
                          Icon(d.selectedIcon),
                          d.badge,
                        ),
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
          bottomNavigationBar: _BottomNavBar(
            destinations: destinations,
            selectedIndex: selectedIndex,
            onSelected: onSelect,
          ),
        );
      },
    );
  }
}

/// The customer bottom bar: a hairline top border and a soft upward shadow so
/// its edge never disappears over white content, with one capsule that slides
/// between equally sized destinations in the ambient reading direction.
class _BottomNavBar extends StatelessWidget {
  const _BottomNavBar({
    required this.destinations,
    required this.selectedIndex,
    required this.onSelected,
  });

  final List<_Destination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border(top: BorderSide(color: colors.divider)),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).colorScheme.shadow.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: NavigationThemes.bottomBarHeight,
          child: LayoutBuilder(
            builder: (context, constraints) => Stack(
              fit: StackFit.expand,
              children: [
                IgnorePointer(
                  child: AnimatedAlign(
                    alignment: AlignmentDirectional(
                      destinations.length == 1
                          ? 0
                          : -1 + 2 * selectedIndex / (destinations.length - 1),
                      0,
                    ),
                    duration: AppMotion.medium,
                    curve: NavigationThemes.bottomBarCurve,
                    child: SizedBox(
                      width: constraints.maxWidth / destinations.length,
                      child: Padding(
                        padding: NavigationThemes.bottomBarCapsulePadding,
                        child: Center(
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(
                              maxWidth:
                                  NavigationThemes.bottomBarCapsuleMaxWidth,
                            ),
                            child: DecoratedBox(
                              key: const ValueKey('bottom-nav-capsule'),
                              decoration: BoxDecoration(
                                color: colors.primarySoft,
                                borderRadius: AppRadii.pillAll,
                              ),
                              child: const SizedBox.expand(),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Row(
                  children: [
                    for (var i = 0; i < destinations.length; i++)
                      Expanded(
                        child: _BottomNavItem(
                          destination: destinations[i],
                          selected: i == selectedIndex,
                          onTap: () {
                            if (i != selectedIndex) {
                              HapticFeedback.selectionClick();
                            }
                            onSelected(i);
                          },
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final _Destination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final iconColor = selected ? colors.primary : colors.textMuted;
    final labelStyle = context.text.labelMedium?.copyWith(
      color: iconColor,
      fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
    );

    return Semantics(
      selected: selected,
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _badged(
              context,
              AnimatedScale(
                scale: selected ? NavigationThemes.bottomBarSelectedScale : 1,
                duration: AppMotion.medium,
                curve: NavigationThemes.bottomBarCurve,
                child: Icon(
                  selected ? destination.selectedIcon : destination.icon,
                  color: iconColor,
                  size: NavigationThemes.bottomBarIconSize,
                ),
              ),
              destination.badge,
            ),
            Padding(
              padding: NavigationThemes.bottomBarLabelPadding,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(destination.label, maxLines: 1, style: labelStyle),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
