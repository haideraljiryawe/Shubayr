import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_motion.dart';

abstract final class NavigationThemes {
  static const Duration bottomPageTransitionDuration = AppMotion.medium;
  static const Curve bottomPageTransitionCurve = AppMotion.standard;
  static const double bottomPageIncomingOffset = 0.22;
  static const double bottomPageOutgoingOffset = 0.10;
  static const double bottomPageIncomingOpacity = 0.96;

  // ---------------------------------------------------------------------------
  // Bottom navigation supports 2–5 top-level destinations. Geometry comes from
  // safe constraints: 96% phone width, capped at 560, with >=44px touch slots.
  // ---------------------------------------------------------------------------

  /// Visual bounds are taller than the centered interactive strip. Only the
  /// decorative margin may overlap a system exclusion; hit targets never do.
  // Preserve vertical clearance around the base pill; visual widths are capped
  // independently so wide slots do not stretch their decorative capsules.
  static const double _bottomBarGeometricHeight =
      bottomBarSelectedBaseHeight + 2 * bottomBarSelectedSlotInset;
  static const double bottomBarHeight =
      _bottomBarGeometricHeight >= bottomBarMinimumInteractiveHeight
      ? _bottomBarGeometricHeight
      : bottomBarMinimumInteractiveHeight;
  static const int bottomBarMinDestinations = 2;
  static const int bottomBarMaxDestinations = 5;
  static const double bottomBarWidthFactor = 0.96;
  static const double bottomBarMaxWidth = 560;
  // Keep the established minimum hit height centered within the taller surface.
  static const double bottomBarMinimumInteractiveHeight = 44;
  static double get bottomBarSafeVisualOverlap =>
      math.max(0.0, (bottomBarHeight - bottomBarMinimumInteractiveHeight) / 2);

  /// viewPadding retains system UI clearance when the keyboard consumes
  /// padding. The larger system exclusion wins on every platform. Clamping
  /// the offset keeps the visual surface on screen when the inset is small.
  static double bottomBarBottomOffset(MediaQueryData media) => math.max(
    0.0,
    math.max(media.viewPadding.bottom, media.systemGestureInsets.bottom) -
        bottomBarSafeVisualOverlap,
  );

  /// Blend the established dark tint into the color, not the backdrop.
  static Color bottomBarSurfaceColor(ColorScheme colors) =>
      colors.brightness == Brightness.dark
      ? Color.alphaBlend(
          Colors.white.withValues(alpha: 0.08),
          colors.surface.withValues(alpha: 1),
        )
      : Colors.white;

  static const double bottomBarBorderOpacity = 0.22;
  static const double bottomBarBorderWidth = 0.8;
  static const double bottomBarShadowOpacityLight = 0.11;
  static const double bottomBarShadowOpacityDark = 0.12;
  static const double bottomBarShadowBlur = 24;
  static const double bottomBarShadowSpread = 0;
  static const Offset bottomBarShadowOffset = Offset(0, 4);

  static BoxShadow bottomBarShadow(ColorScheme colors) => BoxShadow(
    color: colors.shadow.withValues(
      alpha: colors.brightness == Brightness.dark
          ? bottomBarShadowOpacityDark
          : bottomBarShadowOpacityLight,
    ),
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

  static const double bottomBarSelectedBaseHeight = 52;
  // Keep horizontal geometry independent of the increased vertical clearance.
  static const double bottomBarSelectedSlotInset = 6;

  static const double bottomBarSelectedMaxAspectRatio = 2.2;
  static const double bottomBarPressedMaxAspectRatio = 2.2;

  static EdgeInsets bottomBarPadding(MediaQueryData media, double gutter) =>
      EdgeInsets.only(
        left: math.max(
          gutter,
          math.max(media.viewPadding.left, media.padding.left),
        ),
        right: math.max(
          gutter,
          math.max(media.viewPadding.right, media.padding.right),
        ),
        bottom: bottomBarBottomOffset(media),
      );

  static bool isBottomBarDestinationCountValid(int count) =>
      count >= bottomBarMinDestinations && count <= bottomBarMaxDestinations;

  static double bottomBarMinimumSafeWidth(int destinationCount) =>
      destinationCount *
      bottomBarMinimumInteractiveHeight /
      bottomBarWidthFactor;

  /// Reject unsupported constraints rather than silently shrinking touch targets.
  static ({double barWidth, double slotWidth, Size selected, Size pressed})
  bottomBarGeometry(double safeAvailableWidth, int destinationCount) {
    if (!isBottomBarDestinationCountValid(destinationCount)) {
      throw FlutterError(
        'Bottom Navigation supports 2–5 top-level destinations; '
        'received $destinationCount.',
      );
    }
    final minimumBarWidth =
        destinationCount * bottomBarMinimumInteractiveHeight;
    final barWidth = math.min(
      safeAvailableWidth * bottomBarWidthFactor,
      bottomBarMaxWidth,
    );
    if (!safeAvailableWidth.isFinite || barWidth < minimumBarWidth) {
      throw FlutterError(
        'Bottom Navigation requires at least '
        '${bottomBarMinimumSafeWidth(destinationCount)} logical pixels of safe '
        'available width for $destinationCount destinations with 44×44 touch '
        'targets; received $safeAvailableWidth.',
      );
    }
    final slotWidth = barWidth / destinationCount;
    final selectedNaturalWidth = slotWidth - 2 * bottomBarSelectedSlotInset;
    final selectedHeight = math.min(
      bottomBarSelectedBaseHeight,
      selectedNaturalWidth,
    );
    final pressedInset = math.max(
      bottomBarPressedMinSlotInset,
      bottomBarSelectedSlotInset * bottomBarPressedSlotInsetRatio,
    );
    final pressedNaturalWidth = slotWidth - 2 * pressedInset;
    final pressedHeight = math.min(
      bottomBarHeight - 2 * bottomBarPressedVerticalInset,
      pressedNaturalWidth,
    );
    return (
      barWidth: barWidth,
      slotWidth: slotWidth,
      selected: Size(
        math.min(
          selectedNaturalWidth,
          selectedHeight * bottomBarSelectedMaxAspectRatio,
        ),
        selectedHeight,
      ),
      pressed: Size(
        math.min(
          pressedNaturalWidth,
          pressedHeight * bottomBarPressedMaxAspectRatio,
        ),
        pressedHeight,
      ),
    );
  }

  static const double bottomBarSelectedSurfaceOpacity = 0.20;
  static Color bottomBarSelectedSurfaceColor(AppColors colors) =>
      colors.primary.withValues(alpha: bottomBarSelectedSurfaceOpacity);
  static const double bottomBarSelectedScale = 1.10;
  static const Duration bottomBarSelectedIconDuration = Duration(
    milliseconds: 200,
  );
  static const Curve bottomBarSelectedIconCurve = Curves.easeOutCubic;
  static const Duration bottomBarSelectionDuration = AppMotion.medium;
  static const Curve bottomBarCurve = Curves.easeInOut;
  static const double bottomBarPressedOverlayOpacity = 0.10;
  static const double bottomBarSelectedPressedOverlayOpacity = 0.07;
  static const double bottomBarHoverOverlayOpacity = 0.05;
  static const double bottomBarPressedVerticalInset = 2.5;
  static const double bottomBarPressedSlotInsetRatio = 0.35;
  static const double bottomBarPressedMinSlotInset = 2;
  static const double bottomBarPressedInitialScale = 0.50;
  static const Duration bottomBarPressedExpandDuration = Duration(
    milliseconds: 130,
  );
  static const Duration bottomBarPressedFadeDuration = Duration(
    milliseconds: 160,
  );
  static const Curve bottomBarPressedExpandCurve = Curves.easeOutCubic;

  static double bottomBarStateOpacity(
    Set<WidgetState> states, {
    required bool selected,
  }) {
    if (states.contains(WidgetState.pressed) ||
        states.contains(WidgetState.focused)) {
      return selected
          ? bottomBarSelectedPressedOverlayOpacity
          : bottomBarPressedOverlayOpacity;
    }
    if (states.contains(WidgetState.hovered)) {
      return bottomBarHoverOverlayOpacity;
    }
    return 0;
  }

  /// Default Material NavigationBar theme, separate from the customer shell's
  /// icon-only CustomerBottomNavigation and its custom selected capsule.
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
