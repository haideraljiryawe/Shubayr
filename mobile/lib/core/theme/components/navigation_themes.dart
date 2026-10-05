import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_motion.dart';
import '../tokens/app_spacing.dart';

abstract final class NavigationThemes {
  // ---------------------------------------------------------------------------
  // Bottom navigation metrics — the single source of truth for the bar's size.
  // Tune the bar here; never hard-code these numbers in CustomerShell.
  // ---------------------------------------------------------------------------

  /// Whole surface and touch-target height; system insets stay outside the bar.
  /// Each destination still has a touch target taller than 48px.
  static const double bottomBarHeight = 66;

  /// Reserve real breathing room at larger accessibility text sizes too.
  static double bottomBarHeightFor(MediaQueryData media) => math
      .max(
        bottomBarHeight,
        bottomBarIconSize * bottomBarSelectedScale +
            bottomBarLabelGap +
            (media.textScaler.scale(bottomBarLabelSize) * bottomBarLabelHeight)
                .ceilToDouble() +
            2 * (bottomBarCapsuleInset + bottomBarSelectedVerticalPadding),
      )
      .ceilToDouble();

  static const double bottomBarBottomGap = 4;

  /// viewPadding retains system UI clearance even when the keyboard consumes
  /// padding. Gesture insets can be larger (Android gesture navigation).
  /// Neither changes internal geometry; the larger exclusion wins, not a sum.
  static double bottomBarBottomOffset(MediaQueryData media) =>
      math.max(media.viewPadding.bottom, media.systemGestureInsets.bottom) +
      bottomBarBottomGap;

  // Frosted surface, outline and shadow. Lower opacity = more transparent.
  static const double bottomBarSurfaceOpacity = 0.60;
  static const double bottomBarBlurSigma = 3;
  static const double bottomBarBorderOpacity = 0.16;
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

  static const double bottomBarCornerRadius = AppRadii.xl;
  static const BorderRadius bottomBarRadius = BorderRadius.all(
    Radius.circular(bottomBarCornerRadius),
  );
  static const double bottomBarIconSize = 26;
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

  /// Each capsule fills its equal-width slot minus this concentric inset.
  /// No fixed width cap: 3, 4 and 5 destinations share the same geometry.
  static const double bottomBarCapsuleInset = AppSpacing.xs;
  static const EdgeInsets bottomBarCapsulePadding = EdgeInsets.all(
    bottomBarCapsuleInset,
  );

  /// Content clearance is measured INSIDE the capsule, on every destination
  /// so selection never changes the icon/label position or available width.
  static const double bottomBarSelectedHorizontalPadding = 8;
  static const double bottomBarSelectedVerticalPadding = 6;
  static const EdgeInsets bottomBarContentPadding = EdgeInsets.symmetric(
    horizontal: bottomBarCapsuleInset + bottomBarSelectedHorizontalPadding,
    vertical: bottomBarCapsuleInset + bottomBarSelectedVerticalPadding,
  );
  // Concentric corners: inner radius = outer radius minus the inset.
  static const BorderRadius bottomBarCapsuleRadius = BorderRadius.all(
    Radius.circular(bottomBarCornerRadius - bottomBarCapsuleInset),
  );
  static const double bottomBarSelectedSurfaceOpacity = 0.20;
  static Color bottomBarSelectedSurfaceColor(AppColors colors) =>
      colors.primary.withValues(alpha: bottomBarSelectedSurfaceOpacity);
  static const double bottomBarSelectedScale = 1.05;
  static const Duration bottomBarSelectionDuration = AppMotion.medium;
  static const Curve bottomBarCurve = Curves.easeInOut;
  static const double bottomBarPressedScale = 0.97;
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
