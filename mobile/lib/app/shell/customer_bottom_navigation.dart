import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/layout/app_layout.dart';
import '../../core/theme/components/navigation_themes.dart';
import '../../core/theme/theme_context.dart';

/// Stable destination identity also owns press state when visible tabs change.
typedef CustomerNavigationDestination = ({
  Object id,
  IconData icon,
  IconData selectedIcon,
  String label,
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

/// Floating customer bottom bar with one capsule sliding between equally sized
/// destinations in the ambient reading direction. Only the rounded surface is
/// frosted; content remains visible behind the safe area and outer margins.
class CustomerBottomNavigation extends StatelessWidget {
  const CustomerBottomNavigation({
    super.key,
    required this.destinations,
    required this.selectedIndex,
    required this.onSelected,
  }) : assert(destinations.length > 0),
       assert(selectedIndex >= 0 && selectedIndex < destinations.length);

  final List<CustomerNavigationDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final media = MediaQuery.of(context);
    final gutter = AppLayout.pageHorizontal(context);
    // The app normally consumes horizontal safe areas above the Navigator.
    // Also support unconsumed insets without adding the gutter on top of them.
    final left = math.max(
      gutter,
      math.max(media.viewPadding.left, media.padding.left),
    );
    final right = math.max(
      gutter,
      math.max(media.viewPadding.right, media.padding.right),
    );
    return Padding(
      padding: EdgeInsets.only(
        left: left,
        right: right,
        bottom: NavigationThemes.bottomBarBottomOffset(media),
      ),
      // Uses the same readable-width cap as Account. Parent constraints govern
      // the width; neither the screen width nor a device/platform is assumed.
      child: ResponsiveContent(
        child: SizedBox(
          width: double.infinity,
          child: DecoratedBox(
            key: const ValueKey('bottom-nav-shadow'),
            decoration: BoxDecoration(
              borderRadius: NavigationThemes.bottomBarRadius,
              boxShadow: [
                NavigationThemes.bottomBarShadow(
                  Theme.of(context).colorScheme.shadow,
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: NavigationThemes.bottomBarRadius,
              child: BackdropFilter(
                filter: ImageFilter.blur(
                  sigmaX: NavigationThemes.bottomBarBlurSigma,
                  sigmaY: NavigationThemes.bottomBarBlurSigma,
                ),
                child: Material(
                  key: const ValueKey('bottom-nav-surface'),
                  color: colors.surface.withValues(
                    alpha: NavigationThemes.bottomBarSurfaceOpacity,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: NavigationThemes.bottomBarRadius,
                    side: NavigationThemes.bottomBarBorder(colors),
                  ),
                  child: SizedBox(
                    height: NavigationThemes.bottomBarHeightFor(
                      MediaQuery.of(context),
                    ),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        IgnorePointer(
                          child: AnimatedAlign(
                            alignment: AlignmentDirectional(
                              destinations.length == 1
                                  ? 0
                                  : -1 +
                                        2 *
                                            selectedIndex /
                                            (destinations.length - 1),
                              0,
                            ),
                            duration:
                                NavigationThemes.bottomBarSelectionDuration,
                            curve: NavigationThemes.bottomBarCurve,
                            child: FractionallySizedBox(
                              widthFactor: 1 / destinations.length,
                              child: Padding(
                                padding:
                                    NavigationThemes.bottomBarCapsulePadding,
                                child: DecoratedBox(
                                  key: const ValueKey('bottom-nav-capsule'),
                                  decoration: BoxDecoration(
                                    color:
                                        NavigationThemes.bottomBarSelectedSurfaceColor(
                                          colors,
                                        ),
                                    borderRadius:
                                        NavigationThemes.bottomBarCapsuleRadius,
                                  ),
                                  child: const SizedBox.expand(),
                                ),
                              ),
                            ),
                          ),
                        ),
                        Row(
                          children: [
                            for (var i = 0; i < destinations.length; i++)
                              Expanded(
                                key: ValueKey(destinations[i].id),
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
            ),
          ),
        ),
      ),
    );
  }
}

class _BottomNavItem extends StatefulWidget {
  const _BottomNavItem({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final CustomerNavigationDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_BottomNavItem> createState() => _BottomNavItemState();
}

class _BottomNavItemState extends State<_BottomNavItem> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final selected = widget.selected;
    final destination = widget.destination;
    final iconColor = selected
        ? colors.primary
        : NavigationThemes.bottomBarUnselectedColor(
            Theme.of(context).colorScheme,
          );
    final labelStyle = NavigationThemes.bottomBarLabelStyle(
      context.text,
      color: iconColor,
      selected: selected,
    );

    return Semantics(
      selected: selected,
      child: InkWell(
        onTap: widget.onTap,
        onHighlightChanged: (pressed) => setState(() => _pressed = pressed),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        splashFactory: NoSplash.splashFactory,
        splashColor: Colors.transparent,
        highlightColor: Colors.transparent,
        child: AnimatedScale(
          scale: _pressed ? NavigationThemes.bottomBarPressedScale : 1,
          duration: NavigationThemes.bottomBarPressDuration,
          curve: NavigationThemes.bottomBarPressCurve,
          child: Padding(
            padding: NavigationThemes.bottomBarContentPadding,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _badged(
                  context,
                  AnimatedScale(
                    scale: selected
                        ? NavigationThemes.bottomBarSelectedScale
                        : 1,
                    duration: NavigationThemes.bottomBarSelectionDuration,
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
                    child: Text(
                      destination.label,
                      maxLines: 1,
                      style: labelStyle,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
