import 'dart:ui' show SemanticsRole;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
/// destinations in the ambient reading direction. Supports 1–5 top-level tabs;
/// the opaque surface leaves content visible through the outer margins.
class CustomerBottomNavigation extends StatelessWidget {
  const CustomerBottomNavigation({
    super.key,
    required this.destinations,
    required this.selectedIndex,
    required this.onSelected,
  }) : assert(
         destinations.length >= NavigationThemes.bottomBarMinDestinations &&
             destinations.length <= NavigationThemes.bottomBarMaxDestinations,
         'Bottom Navigation supports 1–5 top-level destinations.',
       ),
       assert(selectedIndex >= 0 && selectedIndex < destinations.length);

  final List<CustomerNavigationDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    // Empty is invalid configuration. If it still reaches a release build during
    // a session change, unmount old gestures without dividing by zero.
    if (destinations.isEmpty) return const SizedBox.shrink();

    final colors = context.colors;
    final colorScheme = Theme.of(context).colorScheme;
    final media = MediaQuery.of(context);
    final reduceMotion = media.disableAnimations || media.accessibleNavigation;
    // This custom bar owns its bottom clearance. Scaffold passes the inset
    // through without applying it; adding another SafeArea would count it twice.
    return Padding(
      padding: NavigationThemes.bottomBarPadding(
        media,
        platform: Theme.of(context).platform,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final geometry = NavigationThemes.bottomBarGeometry(
            constraints.maxWidth,
            destinations.length,
          );
          return Semantics(
            container: true,
            explicitChildNodes: true,
            role: SemanticsRole.tabBar,
            textDirection: Directionality.of(context),
            child: Align(
              alignment: Alignment.topCenter,
              heightFactor: 1,
              child: SizedBox(
                width: geometry.barWidth,
                height: NavigationThemes.bottomBarHeight,
                child: DecoratedBox(
                  key: const ValueKey('bottom-nav-shadow'),
                  decoration: BoxDecoration(
                    borderRadius: NavigationThemes.bottomBarRadius,
                    boxShadow: [NavigationThemes.bottomBarShadow(colorScheme)],
                  ),
                  child: ClipRRect(
                    borderRadius: NavigationThemes.bottomBarRadius,
                    child: Material(
                      key: const ValueKey('bottom-nav-surface'),
                      color: NavigationThemes.bottomBarSurfaceColor(
                        colorScheme,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: NavigationThemes.bottomBarRadius,
                        side: NavigationThemes.bottomBarBorder(colors),
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
                              duration: reduceMotion
                                  ? Duration.zero
                                  : NavigationThemes.bottomBarSelectionDuration,
                              curve: NavigationThemes.bottomBarCurve,
                              child: SizedBox(
                                width: geometry.slotWidth,
                                child: Center(
                                  child: DecoratedBox(
                                    key: const ValueKey('bottom-nav-capsule'),
                                    decoration: BoxDecoration(
                                      color:
                                          NavigationThemes.bottomBarSelectedSurfaceColor(
                                            colors,
                                          ),
                                      borderRadius: BorderRadius.circular(
                                        geometry.selected.height / 2,
                                      ),
                                    ),
                                    child: SizedBox.fromSize(
                                      size: geometry.selected,
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
                                  key: ValueKey(destinations[i].id),
                                  child: Center(
                                    child: SizedBox(
                                      height: NavigationThemes
                                          .bottomBarMinimumInteractiveHeight,
                                      child: _BottomNavItem(
                                        destination: destinations[i],
                                        selected: i == selectedIndex,
                                        pressedSize: geometry.pressed,
                                        onTap: () {
                                          if (i != selectedIndex) {
                                            HapticFeedback.selectionClick();
                                          }
                                          onSelected(i);
                                        },
                                      ),
                                    ),
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
          );
        },
      ),
    );
  }
}

class _BottomNavItem extends StatefulWidget {
  const _BottomNavItem({
    required this.destination,
    required this.selected,
    required this.onTap,
    required this.pressedSize,
  });

  final CustomerNavigationDestination destination;
  final bool selected;
  final VoidCallback onTap;
  final Size pressedSize;

  @override
  State<_BottomNavItem> createState() => _BottomNavItemState();
}

class _BottomNavItemState extends State<_BottomNavItem>
    with SingleTickerProviderStateMixin {
  late final WidgetStatesController _states = WidgetStatesController()
    ..addListener(_handleStatesChanged);
  late final AnimationController _expansion;
  late final Animation<double> _pressedScale;
  bool _wasPressed = false;
  bool _tapReleasedOutside = false;

  @override
  void initState() {
    super.initState();
    _expansion = AnimationController(
      vsync: this,
      value: 1,
      duration: NavigationThemes.bottomBarPressedExpandDuration,
    );
    _pressedScale = _expansion.drive(
      Tween<double>(
        begin: NavigationThemes.bottomBarPressedInitialScale,
        end: 1,
      ).chain(CurveTween(curve: NavigationThemes.bottomBarPressedExpandCurve)),
    );
  }

  void _handleStatesChanged() {
    final pressed = _states.value.contains(WidgetState.pressed);
    if (pressed && !_wasPressed) {
      final media = MediaQuery.of(context);
      if (media.disableAnimations || media.accessibleNavigation) {
        _expansion.value = 1;
      } else {
        _expansion.forward(from: 0);
      }
    } else if (!pressed && _wasPressed) {
      // Even an early release fades at full size, without a reverse animation.
      _expansion.value = 1;
    }
    // Release only fades the surface; expansion never reverses or shrinks.
    _wasPressed = pressed;
    setState(() {});
  }

  void _handleTapUp(TapUpDetails details) {
    // A small drag can leave the hit target without exceeding tap slop.
    final box = context.findRenderObject()! as RenderBox;
    _tapReleasedOutside = !(Offset.zero & box.size).contains(
      box.globalToLocal(details.globalPosition),
    );
  }

  void _handleTap() {
    final releasedOutside = _tapReleasedOutside;
    // InkWell calls onTap immediately after onTapUp; keyboard activation skips
    // onTapUp. Reset before dispatch so both paths select at most once.
    _tapReleasedOutside = false;
    if (!releasedOutside) widget.onTap();
  }

  @override
  void dispose() {
    _states
      ..removeListener(_handleStatesChanged)
      ..dispose();
    _expansion.dispose();
    super.dispose();
  }

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
    final media = MediaQuery.of(context);
    final reduceMotion = media.disableAnimations || media.accessibleNavigation;

    final size = widget.pressedSize;
    final opacity = NavigationThemes.bottomBarStateOpacity(
      _states.value,
      selected: selected,
    );
    return Semantics(
      role: SemanticsRole.tab,
      label: destination.label,
      value: destination.badge > 0 ? '${destination.badge}' : null,
      button: true,
      selected: selected,
      onTap: widget.onTap,
      excludeSemantics: true,
      child: InkWell(
        onTapUp: _handleTapUp,
        onTap: _handleTap,
        statesController: _states,
        // InkWell owns gestures, focus and keyboard actions. Paint its state
        // layer separately so the full safe hit target stays independent of
        // the narrower (and sometimes taller) decorative capsule bounds.
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        splashFactory: NoSplash.splashFactory,
        splashColor: Colors.transparent,
        highlightColor: Colors.transparent,
        child: Stack(
          fit: StackFit.expand,
          clipBehavior: Clip.none,
          children: [
            IgnorePointer(
              child: OverflowBox(
                minWidth: size.width,
                maxWidth: size.width,
                minHeight: size.height,
                maxHeight: size.height,
                child: ScaleTransition(
                  key: const ValueKey('bottom-nav-press-expansion'),
                  scale: reduceMotion
                      ? const AlwaysStoppedAnimation(1)
                      : _pressedScale,
                  child: ClipRRect(
                    key: const ValueKey('bottom-nav-state-layer'),
                    borderRadius: BorderRadius.circular(size.height / 2),
                    child: AnimatedOpacity(
                      opacity: opacity,
                      duration: reduceMotion
                          ? Duration.zero
                          : _states.value.contains(WidgetState.pressed)
                          ? NavigationThemes.bottomBarPressedExpandDuration
                          : NavigationThemes.bottomBarPressedFadeDuration,
                      child: ColoredBox(color: colors.primary),
                    ),
                  ),
                ),
              ),
            ),
            Center(
              child: _badged(
                context,
                AnimatedScale(
                  scale: selected && !reduceMotion
                      ? NavigationThemes.bottomBarSelectedScale
                      : 1,
                  duration: reduceMotion
                      ? Duration.zero
                      : NavigationThemes.bottomBarSelectedIconDuration,
                  curve: NavigationThemes.bottomBarSelectedIconCurve,
                  child: Icon(
                    selected ? destination.selectedIcon : destination.icon,
                    color: iconColor,
                    size: NavigationThemes.bottomBarIconSize,
                  ),
                ),
                destination.badge,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
