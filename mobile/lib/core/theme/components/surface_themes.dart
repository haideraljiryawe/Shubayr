import 'package:flutter/material.dart';

import '../app_colors.dart';
import '../tokens/app_radii.dart';
import '../tokens/app_spacing.dart';

/// Cards, app bars, sheets, dialogs and dividers.
///
/// Material 3 elevation tinting is switched off everywhere (transparent
/// `surfaceTintColor`) so surfaces keep the warm neutral palette instead of
/// drifting towards the primary colour as they rise.
abstract final class SurfaceThemes {
  static AppBarTheme appBar(AppColors c, TextTheme text) => AppBarTheme(
    backgroundColor: c.background,
    foregroundColor: c.textPrimary,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    scrolledUnderElevation: 0,
    centerTitle: false,
    titleTextStyle: text.titleLarge,
    iconTheme: IconThemeData(color: c.textPrimary, size: 22),
  );

  static CardThemeData card(AppColors c) => CardThemeData(
    color: c.surface,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(
      borderRadius: AppRadii.lgAll,
      side: BorderSide(color: c.border),
    ),
  );

  static DialogThemeData dialog(AppColors c, TextTheme text) => DialogThemeData(
    backgroundColor: c.surface,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    shape: const RoundedRectangleBorder(borderRadius: AppRadii.lgAll),
    titleTextStyle: text.titleLarge,
    contentTextStyle: text.bodyMedium,
  );

  static BottomSheetThemeData bottomSheet(AppColors c) => BottomSheetThemeData(
    backgroundColor: c.surface,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    showDragHandle: true,
    dragHandleColor: c.border,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.xl)),
    ),
  );

  static DividerThemeData divider(AppColors c) =>
      DividerThemeData(color: c.divider, thickness: 1, space: AppSpacing.lg);

  static ListTileThemeData listTile(AppColors c, TextTheme text) =>
      ListTileThemeData(
        iconColor: c.textSecondary,
        textColor: c.textPrimary,
        titleTextStyle: text.titleSmall,
        subtitleTextStyle: text.bodySmall,
        contentPadding: const EdgeInsetsDirectional.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.xs,
        ),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.mdAll),
      );
}
