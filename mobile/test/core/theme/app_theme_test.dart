import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/theme/app_colors.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/components/navigation_themes.dart';
import 'package:shubayr/core/theme/tokens/app_typography.dart';

void main() {
  group('AppColors', () {
    test('bundled brand is the muted green', () {
      expect(AppColors.bundled().primary, const Color(0xFF438C59));
      expect(const Brand.bundled().primaryColor, const Color(0xFF438C59));
    });

    test('background is warm off-white, not pure white', () {
      final colors = AppColors.bundled();
      expect(colors.background, isNot(const Color(0xFFFFFFFF)));
      // Warm: red channel above blue.
      expect(colors.background.r, greaterThan(colors.background.b));
    });

    test('derives darker and lighter shades from any seed', () {
      final colors = AppColors.fromSeed(const Color(0xFF3366CC));
      final seedLightness = HSLColor.fromColor(
        const Color(0xFF3366CC),
      ).lightness;

      expect(
        HSLColor.fromColor(colors.primaryDark).lightness,
        lessThan(seedLightness),
      );
      expect(
        HSLColor.fromColor(colors.primaryLight).lightness,
        greaterThan(seedLightness),
      );
    });

    test('picks a readable foreground for light and dark seeds', () {
      expect(
        AppColors.fromSeed(
          const Color(0xFF101010),
        ).onPrimary.computeLuminance(),
        greaterThan(0.5),
      );
      expect(
        AppColors.fromSeed(
          const Color(0xFFF5F5C0),
        ).onPrimary.computeLuminance(),
        lessThan(0.5),
      );
    });
  });

  group('AppTheme', () {
    test('exposes semantic tokens through a theme extension', () {
      final theme = AppTheme.light(const Brand.bundled());
      final colors = theme.extension<AppColors>();

      expect(colors, isNotNull);
      expect(colors!.primary, const Color(0xFF438C59));
      expect(theme.scaffoldBackgroundColor, colors.background);
      expect(theme.colorScheme.primary, colors.primary);
      expect(theme.useMaterial3, isTrue);
    });

    test('uses the bundled Cairo family throughout the text theme', () {
      final theme = AppTheme.light(const Brand.bundled());

      expect(AppTypography.fontFamily, 'Cairo');
      expect(theme.textTheme.bodyMedium?.fontFamily, 'Cairo');
      expect(theme.textTheme.titleLarge?.fontFamily, 'Cairo');
      expect(theme.textTheme.labelSmall?.fontFamily, 'Cairo');
    });

    test('bottom navigation is flat, compact and token-driven', () {
      final theme = AppTheme.light(const Brand.bundled());
      final nav = theme.navigationBarTheme;

      // Height and icon size come from the single source of truth.
      expect(nav.height, NavigationThemes.bottomBarHeight);
      expect(
        nav.iconTheme?.resolve({WidgetState.selected})?.size,
        NavigationThemes.bottomBarIconSize,
      );
      expect(nav.labelPadding, NavigationThemes.bottomBarLabelPadding);

      // No selected pill and no ripple behind the icon.
      expect(nav.indicatorColor, Colors.transparent);
      expect(
        nav.overlayColor?.resolve({WidgetState.pressed}),
        Colors.transparent,
      );

      // Selection is carried by the foreground only.
      final colors = theme.extension<AppColors>()!;
      expect(
        nav.iconTheme?.resolve({WidgetState.selected})?.color,
        colors.primary,
      );
      expect(nav.iconTheme?.resolve(const {})?.color, colors.textMuted);
      expect(
        nav.labelTextStyle?.resolve({WidgetState.selected})?.color,
        colors.primaryDark,
      );
      expect(
        nav.labelTextStyle?.resolve({WidgetState.selected})?.fontWeight,
        FontWeight.w700,
      );
    });

    test('rebuilds from a runtime brand colour', () {
      final theme = AppTheme.light(
        const Brand.bundled().copyWith(primaryColor: const Color(0xFF3366CC)),
      );
      expect(theme.extension<AppColors>()!.primary, const Color(0xFF3366CC));
      // Neutrals stay bundled — only brand-derived values change.
      expect(
        theme.extension<AppColors>()!.background,
        AppColors.bundled().background,
      );
    });
  });
}
