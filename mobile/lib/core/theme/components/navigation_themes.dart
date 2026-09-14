import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';

abstract final class NavigationThemes {
  // ---------------------------------------------------------------------------
  // Bottom navigation metrics — the single source of truth for the bar's size.
  // Tune the bar here; never hard-code these numbers in CustomerShell.
  // ---------------------------------------------------------------------------

  /// Content height of the bottom navigation bar.
  ///
  /// This is the *content* height only: when the bar is used as
  /// `Scaffold.bottomNavigationBar`, Flutter adds the device's bottom safe-area
  /// inset (the iPhone home indicator) on top of it automatically. Material's
  /// own default is 80; the bar reads too tall on a phone at that size.
  ///
  /// The destination is tappable across the full height, so this doubles as the
  /// touch-target height — keep it at or above 48.
  static const double bottomBarHeight = 70;

  /// Icon size inside the bottom navigation bar.
  static const double bottomBarIconSize = 30;

  /// Gap between a destination's icon and its label.
  static const EdgeInsetsGeometry bottomBarLabelPadding = EdgeInsets.only(
    top: 3,
  );

  /// Active-tab top indicator — the thick bar shown at the top edge of the
  /// selected destination, in the active (primary) colour. Tune its size here;
  /// never hard-code these in CustomerShell.
  static const double bottomBarIndicatorWidth = 50;
  static const double bottomBarIndicatorThickness = 5;

  /// Icon size in the wide-layout navigation rail (left untouched by the
  /// phone-oriented refinement above).
  static const double railIconSize = 24;

  /// Bottom navigation.
  ///
  /// Deliberately has no selected indicator: the Material 3 pill is switched
  /// off (transparent indicator *and* transparent overlay) so a destination is
  /// just an icon above a label. Selection is carried entirely by foreground
  /// colour and label weight.
  static NavigationBarThemeData navigationBar(AppColors c, TextTheme text) =>
      NavigationBarThemeData(
        backgroundColor: c.surface,
        surfaceTintColor: Colors.transparent,
        // No pill, no circle, no ripple — nothing painted behind the icon.
        indicatorColor: Colors.transparent,
        indicatorShape: const RoundedRectangleBorder(
          borderRadius: AppRadii.pillAll,
        ),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        elevation: 0,
        height: bottomBarHeight,
        labelPadding: bottomBarLabelPadding,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              // primaryDark rather than primary: 12px text needs the darker
              // shade to stay legible on the light surface.
              ? text.labelMedium?.copyWith(
                  color: c.primaryDark,
                  fontWeight: FontWeight.w700,
                )
              : text.labelMedium?.copyWith(
                  color: states.contains(WidgetState.disabled)
                      ? c.textDisabled
                      : c.textMuted,
                  fontWeight: FontWeight.w500,
                ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: bottomBarIconSize,
            color: states.contains(WidgetState.selected)
                ? c.primary
                : states.contains(WidgetState.disabled)
                ? c.textDisabled
                : c.textMuted,
          ),
        ),
      );

  static NavigationRailThemeData navigationRail(
    AppColors c,
    TextTheme text,
  ) => NavigationRailThemeData(
    backgroundColor: c.surface,
    indicatorColor: c.primarySoft,
    indicatorShape: const RoundedRectangleBorder(
      borderRadius: AppRadii.pillAll,
    ),
    selectedIconTheme: IconThemeData(color: c.primaryDark, size: 24),
    unselectedIconTheme: IconThemeData(color: c.textMuted, size: 24),
    selectedLabelTextStyle: text.labelMedium?.copyWith(color: c.primaryDark),
    unselectedLabelTextStyle: text.labelMedium?.copyWith(color: c.textMuted),
  );

  static ChipThemeData chip(AppColors c, TextTheme text) => ChipThemeData(
    backgroundColor: c.surfaceAlt,
    selectedColor: c.primarySoft,
    surfaceTintColor: Colors.transparent,
    labelStyle: (text.labelMedium ?? const TextStyle()).copyWith(
      color: WidgetStateColor.resolveWith(
        (states) => states.contains(WidgetState.disabled)
            ? c.textDisabled
            : c.textPrimary,
      ),
    ),
    checkmarkColor: c.textPrimary,
    side: WidgetStateBorderSide.resolveWith(
      (states) =>
          states.contains(WidgetState.selected) &&
              !states.contains(WidgetState.disabled)
          ? BorderSide(color: c.primary, width: 1.25)
          : BorderSide(color: c.border),
    ),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.all(Radius.circular(AppRadii.xs)),
    ),
    // RawChip chooses selectedShadowColor only for selection. Transparent
    // resting shadows keep plain/unselected chips flat without per-screen styles.
    elevation: 1,
    pressElevation: 1,
    shadowColor: Colors.transparent,
    selectedShadowColor: c.primary.withValues(alpha: 0.16),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
  );

  static SnackBarThemeData snackBar(AppColors c, TextTheme text) =>
      SnackBarThemeData(
        // Primary text becomes near-white in dark mode; neutral snackbars
        // still need a dark surface behind their light content and action.
        backgroundColor: c.brightness == Brightness.dark
            ? c.surfaceAlt
            : c.textPrimary,
        contentTextStyle: text.bodyMedium?.copyWith(color: c.onDark),
        actionTextColor: c.primaryLight,
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
      );

  static TabBarThemeData tabBar(AppColors c, TextTheme text) => TabBarThemeData(
    labelColor: c.primaryDark,
    unselectedLabelColor: c.textMuted,
    labelStyle: text.titleSmall,
    unselectedLabelStyle: text.titleSmall,
    indicatorColor: c.primary,
    indicatorSize: TabBarIndicatorSize.label,
    dividerColor: c.divider,
  );
}
