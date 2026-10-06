import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_motion.dart';

abstract final class NavigationThemes {
  // ---------------------------------------------------------------------------
  // Bottom navigation metrics — the single source of truth for the bar's size.
  // Tune the bar here; never hard-code these numbers in CustomerShell.
  // ---------------------------------------------------------------------------

  /// Whole surface and touch-target height; system insets stay outside the bar.
  /// Each destination still has a touch target taller than 48px.
  static const double bottomBarHeight = 58;

  // Icon-only content does not grow with text scaling. Tooltips and semantics
  // retain the destination names without changing the safe 58px touch height.
  static const double bottomBarBottomGap = 2;

  /// viewPadding retains system UI clearance even when the keyboard consumes
  /// padding. Gesture insets can be larger (Android gesture navigation).
  /// Neither changes internal geometry; the larger exclusion wins, not a sum.
  static double bottomBarBottomOffset(MediaQueryData media) =>
      math.max(media.viewPadding.bottom, media.systemGestureInsets.bottom) +
      bottomBarBottomGap;

  // Frosted surface, outline and shadow. Lower opacity = more transparent.
  static const double bottomBarSurfaceOpacityLight = 0.82;
  static const double bottomBarSurfaceOpacityDark = 0.84;
  static double bottomBarSurfaceOpacity(Brightness brightness) =>
      brightness == Brightness.dark
      ? bottomBarSurfaceOpacityDark
      : bottomBarSurfaceOpacityLight;
  static const double bottomBarBlurSigma = 18;
  static const double bottomBarBorderOpacity = 0.10;
  static const double bottomBarBorderWidth = 0.7;
  static const double bottomBarShadowOpacity = 0.08;
  static const double bottomBarShadowBlur = 20;
  static const double bottomBarShadowSpread = 0;
  static const Offset bottomBarShadowOffset = Offset(0, 3);

  static BoxShadow bottomBarShadow(Color shadow) => BoxShadow(
    color: shadow.withValues(alpha: bottomBarShadowOpacity),
    blurRadius: bottomBarShadowBlur,
    spreadRadius: bottomBarShadowSpread,
    offset: bottomBarShadowOffset,
  );
  static BorderSide bottomBarBorder(AppColors colors) => BorderSide(
    color: colors.textPrimary.withValues(alpha: bottomBarBorderOpacity),
    width: bottomBarBorderWidth,
  );

  static const double bottomBarCornerRadius = bottomBarHeight / 2;
  static const BorderRadius bottomBarRadius = BorderRadius.all(
    Radius.circular(bottomBarCornerRadius),
  );
  static const double bottomBarIconSize = 28;
  static const double bottomBarLabelSize = 12;
  static const double bottomBarUnselectedOpacity = 0.92;
  static Color bottomBarUnselectedColor(ColorScheme colors) =>
      colors.onSurface.withValues(alpha: bottomBarUnselectedOpacity);
  static const FontWeight bottomBarSelectedLabelWeight = FontWeight.w700;
  static const FontWeight bottomBarUnselectedLabelWeight = FontWeight.w600;

  static TextStyle? bottomBarLabelStyle(
    TextTheme text, {
    required Color color,
    required bool selected,
  }) => text.labelSmall?.copyWith(
    fontSize: bottomBarLabelSize,
    height: bottomBarLabelHeight,
    color: color,
    fontWeight: selected
        ? bottomBarSelectedLabelWeight
        : bottomBarUnselectedLabelWeight,
  );

  static const double bottomBarLabelGap = 3;
  static const double bottomBarLabelHeight = 1.2;
  static const EdgeInsets bottomBarLabelPadding = EdgeInsets.only(
    top: bottomBarLabelGap,
  );

  /// A short pill centered within the moving equal-width slot. The preferred
  /// width is capped by the slot itself when horizontal safe insets are large.
  static const double bottomBarCapsuleHeight = 44;
  static const double bottomBarCapsuleWidthRatio = 0.75;
  static const double bottomBarCapsuleMinWidth = 58;
  static const double bottomBarCapsuleMaxWidth = 78;
  static const double bottomBarCapsuleSlotInset = 2;
  static double bottomBarCapsuleWidth(double slotWidth) => math.min(
    (slotWidth * bottomBarCapsuleWidthRatio).clamp(
      bottomBarCapsuleMinWidth,
      bottomBarCapsuleMaxWidth,
    ),
    math.max(0, slotWidth - 2 * bottomBarCapsuleSlotInset),
  );
  static const BorderRadius bottomBarCapsuleRadius = BorderRadius.all(
    Radius.circular(bottomBarCapsuleHeight / 2),
  );
  static const double bottomBarSelectedSurfaceOpacity = 0.20;
  static Color bottomBarSelectedSurfaceColor(AppColors colors) =>
      colors.primary.withValues(alpha: bottomBarSelectedSurfaceOpacity);
  static const double bottomBarSelectedScale = 1.03;
  static const Duration bottomBarSelectionDuration = AppMotion.medium;
  static const Curve bottomBarCurve = Curves.easeInOut;
  static const double bottomBarPressedScale = 0.95;
  static const Duration bottomBarPressDuration = Duration(milliseconds: 100);
  static const Curve bottomBarPressCurve = Curves.easeOutCubic;

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
          (states) => bottomBarLabelStyle(
            text,
            selected: states.contains(WidgetState.selected),
            color: states.contains(WidgetState.selected)
                ? c.primaryDark
                : states.contains(WidgetState.disabled)
                ? c.textDisabled
                : bottomBarUnselectedColor(c.toColorScheme()),
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: bottomBarIconSize,
            color: states.contains(WidgetState.selected)
                ? c.primary
                : states.contains(WidgetState.disabled)
                ? c.textDisabled
                : bottomBarUnselectedColor(c.toColorScheme()),
          ),
        ),
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
