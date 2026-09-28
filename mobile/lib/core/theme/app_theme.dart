import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'brand.dart';
import 'components/button_themes.dart';
import 'components/input_theme.dart';
import 'components/navigation_themes.dart';
import 'components/surface_themes.dart';
import 'tokens/app_typography.dart';

/// Builds the app's [ThemeData] from a [Brand].
///
/// Everything visual flows through here: no widget in `features/` builds its
/// own colours, text styles or shapes.
abstract final class AppTheme {
  static ThemeData light(Brand brand) =>
      fromColors(AppColors.fromSeed(brand.primaryColor));

  static ThemeData dark(Brand brand) => fromColors(
    AppColors.fromSeed(brand.primaryColor, brightness: Brightness.dark),
  );

  static ThemeData fromColors(AppColors c) {
    final text = AppTypography.textTheme(c.textPrimary, c.textSecondary);

    return ThemeData(
      useMaterial3: true,
      colorScheme: c.toColorScheme(),
      extensions: <ThemeExtension<dynamic>>[c],
      scaffoldBackgroundColor: c.background,
      canvasColor: c.background,
      splashFactory: InkSparkle.splashFactory,
      fontFamily: AppTypography.fontFamily,
      textTheme: text,
      primaryTextTheme: text,
      iconTheme: IconThemeData(color: c.textSecondary, size: 22),
      appBarTheme: SurfaceThemes.appBar(c, text),
      cardTheme: SurfaceThemes.card(c),
      dialogTheme: SurfaceThemes.dialog(c, text),
      bottomSheetTheme: SurfaceThemes.bottomSheet(c),
      dividerTheme: SurfaceThemes.divider(c),
      listTileTheme: SurfaceThemes.listTile(c, text),
      elevatedButtonTheme: ButtonThemes.elevated(c, text),
      outlinedButtonTheme: ButtonThemes.outlined(c, text),
      textButtonTheme: ButtonThemes.text_(c, text),
      inputDecorationTheme: InputTheme.build(c, text),
      navigationBarTheme: NavigationThemes.navigationBar(c, text),
      chipTheme: NavigationThemes.chip(c, text),
      snackBarTheme: NavigationThemes.snackBar(c, text),
      tabBarTheme: NavigationThemes.tabBar(c, text),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: c.primary,
        linearTrackColor: c.surfaceAlt,
        circularTrackColor: c.surfaceAlt,
      ),
    );
  }
}
