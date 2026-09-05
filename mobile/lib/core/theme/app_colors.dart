import 'package:flutter/material.dart';

import 'tokens/color_primitives.dart';

/// Semantic colour tokens for the whole app.
///
/// Widgets read these via `Theme.of(context).extension<AppColors>()!` (or the
/// `context.colors` shorthand in `theme_context.dart`). Material's
/// [ColorScheme] cannot express the warm neutrals, border/divider split or the
/// status palette we need, so this extension is the source of truth and the
/// [ColorScheme] is derived from it.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.brightness,
    required this.primary,
    required this.primaryDark,
    required this.primaryLight,
    required this.primarySoft,
    required this.onPrimary,
    required this.accent,
    required this.accentSoft,
    required this.onAccent,
    required this.background,
    required this.surface,
    required this.surfaceAlt,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.onDark,
    required this.border,
    required this.divider,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
  });

  /// Builds the full palette from a single brand colour, for either
  /// [Brightness.light] (default) or [Brightness.dark].
  ///
  /// This is what makes runtime white-labelling work: the API only gives us
  /// `primary_color`, so every other brand-derived shade is computed here and
  /// the neutrals/status colours stay bundled. Feature code never chooses a
  /// brightness — it reads whichever palette the active theme installed.
  factory AppColors.fromSeed(
    Color primary, {
    Brightness brightness = Brightness.light,
  }) => brightness == Brightness.dark
      ? AppColors._dark(primary)
      : AppColors._light(primary);

  /// Light palette — warm sand neutrals under the brand colour.
  factory AppColors._light(Color primary) {
    final hsl = HSLColor.fromColor(primary);
    return AppColors(
      brightness: Brightness.light,
      primary: primary,
      primaryDark: hsl
          .withLightness((hsl.lightness * 0.68).clamp(0.0, 1.0))
          .toColor(),
      primaryLight: hsl
          .withLightness(
            (hsl.lightness + (1 - hsl.lightness) * 0.42).clamp(0.0, 1.0),
          )
          .toColor(),
      primarySoft: hsl
          .withSaturation((hsl.saturation * 0.55).clamp(0.0, 1.0))
          .withLightness(0.94)
          .toColor(),
      onPrimary: _readableOn(primary),
      accent: ColorPrimitives.amber500,
      accentSoft: HSLColor.fromColor(
        ColorPrimitives.amber500,
      ).withSaturation(0.45).withLightness(0.93).toColor(),
      onAccent: _readableOn(ColorPrimitives.amber500),
      background: ColorPrimitives.sand50,
      surface: ColorPrimitives.white,
      surfaceAlt: ColorPrimitives.sand100,
      textPrimary: ColorPrimitives.ink900,
      textSecondary: ColorPrimitives.ink600,
      textMuted: ColorPrimitives.ink400,
      onDark: ColorPrimitives.white,
      border: ColorPrimitives.sand200,
      divider: ColorPrimitives.sand150,
      success: ColorPrimitives.success500,
      warning: ColorPrimitives.warning500,
      danger: ColorPrimitives.danger500,
      info: ColorPrimitives.info500,
    );
  }

  /// Dark palette — warm charcoal neutrals, with the brand colour lifted so it
  /// stays legible on dark surfaces regardless of the (white-label) seed.
  factory AppColors._dark(Color primary) {
    final seed = HSLColor.fromColor(primary);
    // Lift dark seeds toward mid-lightness so the brand reads on charcoal.
    final onDarkPrimary = seed
        .withLightness(seed.lightness < 0.55 ? 0.62 : seed.lightness)
        .toColor();
    final p = HSLColor.fromColor(onDarkPrimary);
    return AppColors(
      brightness: Brightness.dark,
      primary: onDarkPrimary,
      primaryDark: p.withLightness((p.lightness * 0.72).clamp(0.0, 1.0)).toColor(),
      primaryLight: p
          .withLightness((p.lightness + (1 - p.lightness) * 0.35).clamp(0.0, 1.0))
          .toColor(),
      // A dark, desaturated brand tint for chips / selected rows / badges.
      primarySoft: p.withSaturation(0.38).withLightness(0.20).toColor(),
      onPrimary: _readableOn(onDarkPrimary),
      accent: ColorPrimitives.amber400,
      accentSoft: HSLColor.fromColor(
        ColorPrimitives.amber400,
      ).withSaturation(0.40).withLightness(0.22).toColor(),
      onAccent: _readableOn(ColorPrimitives.amber400),
      background: ColorPrimitives.charcoal900,
      surface: ColorPrimitives.charcoal800,
      surfaceAlt: ColorPrimitives.charcoal700,
      textPrimary: ColorPrimitives.mist100,
      textSecondary: ColorPrimitives.mist300,
      textMuted: ColorPrimitives.mist500,
      onDark: ColorPrimitives.white,
      border: ColorPrimitives.charcoal600,
      divider: ColorPrimitives.charcoal650,
      success: ColorPrimitives.successDark,
      warning: ColorPrimitives.warningDark,
      danger: ColorPrimitives.dangerDark,
      info: ColorPrimitives.infoDark,
    );
  }

  /// The bundled default brand palette (muted green), light by default.
  factory AppColors.bundled([Brightness brightness = Brightness.light]) =>
      AppColors.fromSeed(ColorPrimitives.green500, brightness: brightness);

  /// Whether this palette is the light or dark set. Drives the derived
  /// [ColorScheme]'s brightness so Material widgets theme correctly.
  final Brightness brightness;

  final Color primary;
  final Color primaryDark;
  final Color primaryLight;

  /// Very light brand tint — chips, selected rows, badges.
  final Color primarySoft;
  final Color onPrimary;

  final Color accent;
  final Color accentSoft;
  final Color onAccent;

  final Color background;
  final Color surface;
  final Color surfaceAlt;

  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;

  /// Text/icon colour on top of dark or saturated fills.
  final Color onDark;

  final Color border;
  final Color divider;

  final Color success;
  final Color warning;
  final Color danger;
  final Color info;

  static Color _readableOn(Color color) => color.computeLuminance() > 0.55
      ? ColorPrimitives.ink900
      : ColorPrimitives.white;

  /// Material [ColorScheme] derived from the semantic tokens, so stock
  /// Material widgets stay on-brand without duplicating colour decisions.
  ColorScheme toColorScheme() => ColorScheme(
    brightness: brightness,
    primary: primary,
    onPrimary: onPrimary,
    primaryContainer: primarySoft,
    onPrimaryContainer: primaryDark,
    secondary: accent,
    onSecondary: onAccent,
    secondaryContainer: accentSoft,
    onSecondaryContainer: textPrimary,
    surface: surface,
    onSurface: textPrimary,
    surfaceContainerLowest: surface,
    surfaceContainerLow: background,
    surfaceContainer: surfaceAlt,
    surfaceContainerHigh: surfaceAlt,
    surfaceContainerHighest: surfaceAlt,
    onSurfaceVariant: textSecondary,
    outline: border,
    outlineVariant: divider,
    error: danger,
    onError: onDark,
    shadow: brightness == Brightness.dark
        ? ColorPrimitives.shadowDark
        : ColorPrimitives.shadow,
  );

  @override
  AppColors copyWith({
    Brightness? brightness,
    Color? primary,
    Color? primaryDark,
    Color? primaryLight,
    Color? primarySoft,
    Color? onPrimary,
    Color? accent,
    Color? accentSoft,
    Color? onAccent,
    Color? background,
    Color? surface,
    Color? surfaceAlt,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? onDark,
    Color? border,
    Color? divider,
    Color? success,
    Color? warning,
    Color? danger,
    Color? info,
  }) {
    return AppColors(
      brightness: brightness ?? this.brightness,
      primary: primary ?? this.primary,
      primaryDark: primaryDark ?? this.primaryDark,
      primaryLight: primaryLight ?? this.primaryLight,
      primarySoft: primarySoft ?? this.primarySoft,
      onPrimary: onPrimary ?? this.onPrimary,
      accent: accent ?? this.accent,
      accentSoft: accentSoft ?? this.accentSoft,
      onAccent: onAccent ?? this.onAccent,
      background: background ?? this.background,
      surface: surface ?? this.surface,
      surfaceAlt: surfaceAlt ?? this.surfaceAlt,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      onDark: onDark ?? this.onDark,
      border: border ?? this.border,
      divider: divider ?? this.divider,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      info: info ?? this.info,
    );
  }

  @override
  AppColors lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return AppColors(
      // Brightness is discrete; snap to the target half-way through the lerp.
      brightness: t < 0.5 ? brightness : other.brightness,
      primary: mix(primary, other.primary),
      primaryDark: mix(primaryDark, other.primaryDark),
      primaryLight: mix(primaryLight, other.primaryLight),
      primarySoft: mix(primarySoft, other.primarySoft),
      onPrimary: mix(onPrimary, other.onPrimary),
      accent: mix(accent, other.accent),
      accentSoft: mix(accentSoft, other.accentSoft),
      onAccent: mix(onAccent, other.onAccent),
      background: mix(background, other.background),
      surface: mix(surface, other.surface),
      surfaceAlt: mix(surfaceAlt, other.surfaceAlt),
      textPrimary: mix(textPrimary, other.textPrimary),
      textSecondary: mix(textSecondary, other.textSecondary),
      textMuted: mix(textMuted, other.textMuted),
      onDark: mix(onDark, other.onDark),
      border: mix(border, other.border),
      divider: mix(divider, other.divider),
      success: mix(success, other.success),
      warning: mix(warning, other.warning),
      danger: mix(danger, other.danger),
      info: mix(info, other.info),
    );
  }
}
