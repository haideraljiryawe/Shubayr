import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/locale_controller.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/theme_mode_controller.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_shadows.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/brand_mark.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../settings/presentation/providers/settings_providers.dart';

/// Developer-only living style guide.
///
/// One screen that renders every design token and shared component, with live
/// theme-mode and locale switches, so the design system can be reviewed and
/// tuned in both light/dark and both text directions before it is spread
/// across feature screens. It is reachable in debug builds only (see the
/// router redirect) and its own labels are intentionally not localised.
class DesignGalleryScreen extends ConsumerWidget {
  const DesignGalleryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final brand = ref.watch(brandProvider);
    final themeMode = ref.watch(themeModeControllerProvider);
    final locale = ref.watch(localeControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Design system')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenH),
        children: [
          // ---- Live switches --------------------------------------------
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _Label('Theme mode'),
                const SizedBox(height: AppSpacing.sm),
                SegmentedButton<ThemeMode>(
                  segments: const [
                    ButtonSegment(
                      value: ThemeMode.system,
                      icon: Icon(Icons.brightness_auto_outlined),
                      label: Text('System'),
                    ),
                    ButtonSegment(
                      value: ThemeMode.light,
                      icon: Icon(Icons.light_mode_outlined),
                      label: Text('Light'),
                    ),
                    ButtonSegment(
                      value: ThemeMode.dark,
                      icon: Icon(Icons.dark_mode_outlined),
                      label: Text('Dark'),
                    ),
                  ],
                  selected: {themeMode},
                  showSelectedIcon: false,
                  onSelectionChanged: (s) => ref
                      .read(themeModeControllerProvider.notifier)
                      .setMode(s.first),
                ),
                const SizedBox(height: AppSpacing.lg),
                const _Label('Language / direction'),
                const SizedBox(height: AppSpacing.sm),
                SegmentedButton<Locale>(
                  segments: const [
                    ButtonSegment(
                      value: Locale('ar'),
                      label: Text('العربية (RTL)'),
                    ),
                    ButtonSegment(
                      value: Locale('en'),
                      label: Text('English (LTR)'),
                    ),
                  ],
                  selected: {Locale(locale.languageCode)},
                  showSelectedIcon: false,
                  onSelectionChanged: (s) => ref
                      .read(localeControllerProvider.notifier)
                      .setLocale(AppLocales.fromCode(s.first.languageCode)),
                ),
              ],
            ),
          ),

          // ---- Brand ----------------------------------------------------
          _Section(
            title: 'Brand',
            child: Row(
              children: [
                BrandMark(brand: brand, size: 56),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        brand.name ?? 'Store (fallback name)',
                        style: context.text.titleMedium,
                      ),
                      Text(
                        'Currency: ${brand.currencyCode}',
                        style: context.text.bodySmall?.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ---- Colours --------------------------------------------------
          _Section(
            title: 'Colours',
            child: Wrap(
              spacing: AppSpacing.md,
              runSpacing: AppSpacing.md,
              children: [
                _Swatch('primary', colors.primary),
                _Swatch('primaryDark', colors.primaryDark),
                _Swatch('primaryLight', colors.primaryLight),
                _Swatch('primarySoft', colors.primarySoft),
                _Swatch('accent', colors.accent),
                _Swatch('accentSoft', colors.accentSoft),
                _Swatch('background', colors.background),
                _Swatch('surface', colors.surface),
                _Swatch('surfaceAlt', colors.surfaceAlt),
                _Swatch('border', colors.border),
                _Swatch('divider', colors.divider),
                _Swatch('success', colors.success),
                _Swatch('warning', colors.warning),
                _Swatch('danger', colors.danger),
                _Swatch('info', colors.info),
              ],
            ),
          ),

          // ---- Typography -----------------------------------------------
          _Section(
            title: 'Typography (Cairo)',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Type('displaySmall', context.text.displaySmall),
                _Type('headlineMedium', context.text.headlineMedium),
                _Type('headlineSmall', context.text.headlineSmall),
                _Type('titleLarge', context.text.titleLarge),
                _Type('titleMedium', context.text.titleMedium),
                _Type('bodyLarge', context.text.bodyLarge),
                _Type('bodyMedium', context.text.bodyMedium),
                _Type('bodySmall', context.text.bodySmall),
                _Type('labelLarge', context.text.labelLarge),
              ],
            ),
          ),

          // ---- Buttons --------------------------------------------------
          _Section(
            title: 'Buttons',
            child: Column(
              children: [
                AppButton(label: 'Primary', onPressed: () {}),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: 'Primary with icon',
                  icon: Icons.add_shopping_cart_outlined,
                  onPressed: () {},
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: 'Secondary',
                  variant: AppButtonVariant.secondary,
                  onPressed: () {},
                ),
                const SizedBox(height: AppSpacing.sm),
                const AppButton(
                  label: 'Loading',
                  isLoading: true,
                  onPressed: null,
                ),
                const SizedBox(height: AppSpacing.sm),
                const AppButton(label: 'Disabled', onPressed: null),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    AppButton(
                      label: 'Plain',
                      variant: AppButtonVariant.plain,
                      expand: false,
                      onPressed: () {},
                    ),
                  ],
                ),
              ],
            ),
          ),

          // ---- Inputs ---------------------------------------------------
          _Section(
            title: 'Inputs',
            child: Column(
              children: [
                const TextField(
                  decoration: InputDecoration(
                    labelText: 'Label',
                    hintText: 'Hint text',
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                const TextField(
                  decoration: InputDecoration(
                    labelText: 'With error',
                    errorText: 'Something is wrong',
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    _StatefulSwitch(),
                    const SizedBox(width: AppSpacing.md),
                    _StatefulCheck(),
                  ],
                ),
              ],
            ),
          ),

          // ---- Chips ----------------------------------------------------
          _Section(
            title: 'Chips',
            child: Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                const Chip(label: Text('Chip')),
                ChoiceChip(
                  label: const Text('Selected'),
                  selected: true,
                  onSelected: (_) {},
                ),
                ChoiceChip(
                  label: const Text('Unselected'),
                  selected: false,
                  onSelected: (_) {},
                ),
              ],
            ),
          ),

          // ---- Radii ----------------------------------------------------
          _Section(
            title: 'Corner radii',
            child: Wrap(
              spacing: AppSpacing.md,
              runSpacing: AppSpacing.md,
              children: const [
                _RadiusBox('xs', AppRadii.xs),
                _RadiusBox('sm', AppRadii.sm),
                _RadiusBox('md', AppRadii.md),
                _RadiusBox('lg', AppRadii.lg),
                _RadiusBox('xl', AppRadii.xl),
              ],
            ),
          ),

          // ---- Shadows / elevation -------------------------------------
          _Section(
            title: 'Elevation',
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: const [
                _ShadowBox('level1', 1),
                _ShadowBox('level2', 2),
                _ShadowBox('level3', 3),
              ],
            ),
          ),

          // ---- State views ----------------------------------------------
          _Section(
            title: 'State views',
            child: Column(
              children: const [
                SizedBox(height: 150, child: AppLoadingView()),
                Divider(),
                SizedBox(height: 220, child: AppEmptyView()),
                Divider(),
                SizedBox(height: 240, child: AppErrorView()),
                Divider(),
                SizedBox(height: 220, child: ComingSoonView()),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Small private helpers used only by this gallery.
// ---------------------------------------------------------------------------

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: AppSpacing.section),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: context.text.titleMedium?.copyWith(
            color: context.colors.textSecondary,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppCard(child: child),
      ],
    ),
  );
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: context.text.titleSmall);
}

class _Swatch extends StatelessWidget {
  const _Swatch(this.name, this.color);

  final String name;
  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 92,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 48,
          decoration: BoxDecoration(
            color: color,
            borderRadius: AppRadii.smAll,
            border: Border.all(color: context.colors.border),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(name, style: context.text.labelSmall),
      ],
    ),
  );
}

class _Type extends StatelessWidget {
  const _Type(this.name, this.style);

  final String name;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: AppSpacing.md),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          name,
          style: context.text.labelSmall?.copyWith(
            color: context.colors.textMuted,
          ),
        ),
        Text('نص عربي · English text', style: style),
      ],
    ),
  );
}

class _RadiusBox extends StatelessWidget {
  const _RadiusBox(this.name, this.radius);

  final String name;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Column(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: colors.primarySoft,
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: colors.border),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(name, style: context.text.labelSmall),
      ],
    );
  }
}

class _ShadowBox extends StatelessWidget {
  const _ShadowBox(this.name, this.level);

  final String name;
  final int level;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final shadow = switch (level) {
      1 => AppShadows.level1,
      2 => AppShadows.level2,
      _ => AppShadows.level3,
    };
    return Column(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: AppRadii.lgAll,
            border: Border.all(color: colors.border),
            boxShadow: shadow,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(name, style: context.text.labelSmall),
      ],
    );
  }
}

class _StatefulSwitch extends StatefulWidget {
  @override
  State<_StatefulSwitch> createState() => _StatefulSwitchState();
}

class _StatefulSwitchState extends State<_StatefulSwitch> {
  bool _on = true;

  @override
  Widget build(BuildContext context) =>
      Switch(value: _on, onChanged: (v) => setState(() => _on = v));
}

class _StatefulCheck extends StatefulWidget {
  @override
  State<_StatefulCheck> createState() => _StatefulCheckState();
}

class _StatefulCheckState extends State<_StatefulCheck> {
  bool _on = true;

  @override
  Widget build(BuildContext context) =>
      Checkbox(value: _on, onChanged: (v) => setState(() => _on = v ?? false));
}
