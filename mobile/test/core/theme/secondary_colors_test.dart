import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/theme/app_colors.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/widgets/quantity_stepper.dart';

double contrast(Color a, Color b) {
  final x = a.computeLuminance() + 0.05;
  final y = b.computeLuminance() + 0.05;
  return x > y ? x / y : y / x;
}

void main() {
  for (final brightness in Brightness.values) {
    final dark = brightness == Brightness.dark;
    final colors = AppColors.bundled(brightness);
    final oldSecondary = Color(dark ? 0xFFB4BAB5 : 0xFF585F59);
    final oldMuted = Color(dark ? 0xFF838A85 : 0xFF8A918B);
    final theme = AppTheme.fromColors(colors);
    const disabled = {WidgetState.disabled};
    const selected = {WidgetState.selected};

    test('supporting copy is clearer but below primary in $brightness', () {
      expect(colors.textPrimary, Color(dark ? 0xFFECEFEC : 0xFF1B1F1C));
      expect(colors.textDisabled, oldMuted);
      for (final surface in [
        colors.surface,
        colors.background,
        colors.surfaceAlt,
      ]) {
        final secondary = contrast(colors.textSecondary, surface);
        final muted = contrast(colors.textMuted, surface);
        expect(secondary, greaterThan(contrast(oldSecondary, surface)));
        expect(muted, greaterThan(contrast(oldMuted, surface)));
        expect(contrast(colors.textPrimary, surface), greaterThan(secondary));
        expect(secondary, greaterThan(muted));
        expect(muted, greaterThan(contrast(colors.textDisabled, surface)));
      }
      for (final surface in [colors.background, colors.surface]) {
        expect(contrast(colors.textMuted, surface), greaterThanOrEqualTo(4.5));
      }
      expect(theme.textTheme.bodySmall!.color, colors.textSecondary);
      expect(theme.textTheme.labelSmall!.color, colors.textSecondary);
      expect(theme.colorScheme.onSurfaceVariant, colors.textSecondary);
    });

    test('disabled controls retain their old colour in $brightness', () {
      for (final style in [
        theme.elevatedButtonTheme.style!,
        theme.outlinedButtonTheme.style!,
        theme.textButtonTheme.style!,
      ]) {
        expect(style.foregroundColor!.resolve(disabled), oldMuted);
      }
      expect(
        WidgetStateProperty.resolveAs(
          theme.chipTheme.labelStyle!.color!,
          disabled,
        ),
        oldMuted,
      );
      final input = theme.inputDecorationTheme;
      expect(
        WidgetStateProperty.resolveAs(input.hintStyle!, disabled).color,
        oldMuted,
      );
      expect(
        WidgetStateProperty.resolveAs(input.prefixIconColor!, disabled),
        oldMuted,
      );
      expect(
        WidgetStateProperty.resolveAs(input.hintStyle!, {}).color,
        colors.textMuted,
      );
      final nav = theme.navigationBarTheme;
      final unselected = theme.colorScheme.onSurface.withValues(alpha: 0.92);
      expect(nav.labelTextStyle!.resolve({})!.color, unselected);
      expect(nav.iconTheme!.resolve({})!.color, unselected);
      expect(nav.iconTheme!.resolve(disabled)!.color, oldMuted);
      expect(nav.labelTextStyle!.resolve(disabled)!.color, oldMuted);
      expect(nav.iconTheme!.resolve(selected)!.color, colors.primary);
      expect(nav.labelTextStyle!.resolve(selected)!.color, colors.primaryDark);
      expect(theme.tabBarTheme.unselectedLabelColor, colors.textMuted);
      // Updating semantic colours must not alter typography or control metrics.
      final oldTheme = AppTheme.fromColors(
        colors.copyWith(textSecondary: oldSecondary, textMuted: oldMuted),
      );
      expect(
        theme.textTheme.bodySmall!.copyWith(color: oldSecondary),
        oldTheme.textTheme.bodySmall,
      );
      expect(
        theme.navigationBarTheme.height,
        oldTheme.navigationBarTheme.height,
      );
      expect(
        theme.navigationBarTheme.labelPadding,
        oldTheme.navigationBarTheme.labelPadding,
      );
    });

    testWidgets(
      'rendered hints and quantity controls keep disabled distinct $brightness',
      (tester) async {
        num quantity = 1;
        await tester.pumpWidget(
          MaterialApp(
            theme: theme,
            home: Scaffold(
              body: Column(
                children: [
                  const TextField(
                    decoration: InputDecoration(
                      hintText: 'Helper',
                      prefixIcon: Icon(Icons.search),
                    ),
                  ),
                  const TextField(
                    enabled: false,
                    decoration: InputDecoration(
                      hintText: 'Unavailable',
                      prefixIcon: Icon(Icons.lock),
                    ),
                  ),
                  StatefulBuilder(
                    builder: (context, setState) => QuantityStepper(
                      quantity: quantity,
                      onChanged: (value) => setState(() => quantity = value),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        Color? renderedText(String value) {
          final text = tester.widget<Text>(find.text(value));
          return DefaultTextStyle.of(
            tester.element(find.text(value)),
          ).style.merge(text.style).color;
        }

        expect(renderedText('Helper'), colors.textMuted);
        expect(renderedText('Unavailable'), colors.textDisabled);
        expect(
          tester.widget<Icon>(find.byIcon(Icons.remove)).color,
          colors.textDisabled,
        );
        await tester.tap(find.byIcon(Icons.remove));
        expect(quantity, 1);
        await tester.tap(find.byIcon(Icons.add));
        await tester.pump();
        expect(quantity, 2);
        expect(
          tester.widget<Icon>(find.byIcon(Icons.remove)).color,
          colors.textPrimary,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  test('disabled colour survives palette copies and theme transitions', () {
    final light = AppColors.bundled();
    final dark = AppColors.bundled(Brightness.dark);
    expect(light.copyWith().textDisabled, light.textDisabled);
    expect(
      light.copyWith(textMuted: light.textPrimary).textDisabled,
      light.textDisabled,
    );
    expect(
      light.lerp(dark, 0.5).textDisabled,
      Color.lerp(light.textDisabled, dark.textDisabled, 0.5),
    );
  });
}
