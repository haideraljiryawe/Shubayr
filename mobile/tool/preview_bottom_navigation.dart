// Standalone visual harness; no application routes, session or repositories.
// flutter run -t tool/preview_bottom_navigation.dart -d <simulator-id>
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shubayr/app/shell/customer_bottom_navigation.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/components/navigation_themes.dart';
import 'package:shubayr/core/theme/theme_context.dart';

void main() {
  if (!kDebugMode) throw StateError('This visual harness is debug-only.');
  runApp(const BottomNavigationPreview());
}

class BottomNavigationPreview extends StatefulWidget {
  const BottomNavigationPreview({super.key});

  @override
  State<BottomNavigationPreview> createState() =>
      _BottomNavigationPreviewState();
}

class _BottomNavigationPreviewState extends State<BottomNavigationPreview> {
  int _count = 3;
  int _selected = 0;
  bool _dark = false;
  bool _rtl = true;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: AppTheme.light(const Brand.bundled()),
    darkTheme: AppTheme.dark(const Brand.bundled()),
    themeMode: _dark ? ThemeMode.dark : ThemeMode.light,
    locale: Locale(_rtl ? 'ar' : 'en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Builder(
      builder: (context) {
        final l10n = AppLocalizations.of(context);
        final icons = [
          (Icons.home_outlined, Icons.home, l10n.navHome),
          (
            Icons.grid_view_outlined,
            Icons.grid_view_rounded,
            l10n.navCategories,
          ),
          (Icons.shopping_cart_outlined, Icons.shopping_cart, l10n.navCart),
          (Icons.receipt_long_outlined, Icons.receipt_long, l10n.navOrders),
          (Icons.person_outline, Icons.person, l10n.navAccount),
          (Icons.favorite_border, Icons.favorite, 'Preview 6'),
        ];
        return Scaffold(
          extendBody: true,
          appBar: AppBar(
            title: const Text('Navigation geometry'),
            actions: [
              IconButton(
                tooltip: 'Light / dark',
                onPressed: () => setState(() => _dark = !_dark),
                icon: const Icon(Icons.brightness_6),
              ),
              IconButton(
                tooltip: 'RTL / LTR',
                onPressed: () => setState(() => _rtl = !_rtl),
                icon: const Icon(Icons.format_textdirection_r_to_l),
              ),
            ],
          ),
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                Wrap(
                  spacing: 8,
                  children: [
                    for (var count = 1; count <= 6; count++)
                      ChoiceChip(
                        label: Text('$count'),
                        selected: _count == count,
                        onSelected: (_) => setState(() {
                          _count = count;
                          _selected = _selected.clamp(0, count - 1);
                        }),
                      ),
                  ],
                ),
                Text(
                  'Viewport: ${MediaQuery.sizeOf(context).width.toStringAsFixed(0)}px · $_count destinations',
                ),
                Text(
                  'View inset: ${MediaQuery.viewPaddingOf(context).bottom.toStringAsFixed(0)} · '
                  'Gesture: ${MediaQuery.systemGestureInsetsOf(context).bottom.toStringAsFixed(0)} · '
                  'Bar offset: ${NavigationThemes.bottomBarBottomOffset(MediaQuery.of(context), platform: Theme.of(context).platform).toStringAsFixed(0)}',
                ),
                Expanded(
                  child: ListView.builder(
                    padding: EdgeInsets.fromLTRB(
                      8,
                      16,
                      8,
                      MediaQuery.paddingOf(context).bottom + 16,
                    ),
                    itemCount: 12,
                    itemBuilder: (context, index) => Container(
                      height: 116,
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: context.colors.surface,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Row(
                        children: [
                          Expanded(
                            child: Center(child: Text('Preview ${index + 1}')),
                          ),
                          Expanded(
                            child: ColoredBox(
                              color: Colors
                                  .primaries[index % Colors.primaries.length],
                              child: const SizedBox.expand(),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: CustomerBottomNavigation(
            destinations: [
              for (var index = 0; index < _count; index++)
                (
                  id: index,
                  icon: icons[index].$1,
                  selectedIcon: icons[index].$2,
                  label: icons[index].$3,
                  badge: 0,
                ),
            ],
            selectedIndex: _selected,
            onSelected: (index) => setState(() => _selected = index),
          ),
        );
      },
    ),
  );
}
