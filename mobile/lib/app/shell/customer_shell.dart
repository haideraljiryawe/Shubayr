import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/layout/app_layout.dart';
import '../../core/l10n/l10n_context.dart';
import '../../core/theme/components/navigation_themes.dart';
import '../../core/theme/theme_context.dart';
import '../../core/theme/tokens/app_motion.dart';
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
        ref.watch(sessionControllerProvider).valueOrNull?.isSignedIn ?? false;

    // Cart badge counts distinct products (lines), not total units — rebuilds
    // the bar only when a line is added or removed.
    final cartCount = ref.watch(
      cartControllerProvider.select((c) => c.valueOrNull?.items.length ?? 0),
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
/// its edge never disappears over white content, and a thick top indicator on
/// the selected tab in the active (primary) colour.
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
          child: Row(
            children: [
              for (var i = 0; i < destinations.length; i++)
                Expanded(
                  child: _BottomNavItem(
                    destination: destinations[i],
                    selected: i == selectedIndex,
                    onTap: () => onSelected(i),
                  ),
                ),
            ],
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
    // Icon and label sizes/colours read exactly from NavigationThemes (the
    // bar's central metrics) so this custom bar matches the original — only the
    // top border/shadow and active indicator are new.
    final iconColor = selected ? colors.primary : colors.textMuted;
    final labelStyle = selected
        ? context.text.labelMedium?.copyWith(
            color: colors.primaryDark,
            fontWeight: FontWeight.w700,
          )
        : context.text.labelMedium?.copyWith(
            color: colors.textMuted,
            fontWeight: FontWeight.w500,
          );

    return InkWell(
      onTap: onTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Icon + label, centred.
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _badged(
                context,
                Icon(
                  selected ? destination.selectedIcon : destination.icon,
                  color: iconColor,
                  size: NavigationThemes.bottomBarIconSize,
                ),
                destination.badge,
              ),
              Padding(
                padding: NavigationThemes.bottomBarLabelPadding,
                child: Text(
                  destination.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: labelStyle,
                ),
              ),
            ],
          ),
          // Thick top indicator, shown only for the active tab.
          Align(
            alignment: Alignment.topCenter,
            child: AnimatedContainer(
              duration: AppMotion.medium,
              curve: AppMotion.standard,
              height: NavigationThemes.bottomBarIndicatorThickness,
              width: selected ? NavigationThemes.bottomBarIndicatorWidth : 0,
              decoration: BoxDecoration(
                color: colors.primary,
                borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(
                    NavigationThemes.bottomBarIndicatorThickness,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
