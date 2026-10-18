import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/notifications/presentation/notification_providers.dart';
import 'package:shubayr/features/notifications/presentation/notifications_screen.dart';
import '../../features/notifications/notifications_test.dart'
    show InboxRepository;
import '../../helpers/test_session.dart';

// Compare effective localized styles, not just the unlocalized ThemeData.
// Font outline/ink sizes need not match between writing systems.
void main() {
  setUpAll(() async {
    final fonts = FontLoader('Zain');
    for (final face in ['Regular', 'Bold', 'ExtraBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Zain-$face.ttf'));
    }
    await fonts.load();
  });
  for (final dark in [false, true]) {
    for (final width in [280.0, 320.0, 600.0]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets(
          'Arabic/English effective typography parity dark=$dark width=$width scale=$scale',
          (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = Size(width, 1100);
            addTearDown(tester.view.reset);
            final container = ProviderContainer(
              overrides: [
                sessionControllerProvider.overrideWith(
                  () => TestSession(initial: monitorSession),
                ),
                notificationRepositoryProvider.overrideWithValue(
                  InboxRepository(),
                ),
                inboxSyncProvider.overrideWith((ref) {}),
              ],
            );
            addTearDown(container.dispose);
            await container.read(sessionControllerProvider.future);
            await container.read(inboxProvider.future);
            List<TextStyle?>? arabic;
            for (final language in ['ar', 'en']) {
              await tester.pumpWidget(
                UncontrolledProviderScope(
                  container: container,
                  child: MaterialApp(
                    theme: dark
                        ? AppTheme.dark(const Brand.bundled())
                        : AppTheme.light(const Brand.bundled()),
                    locale: Locale(language),
                    localizationsDelegates:
                        AppLocalizations.localizationsDelegates,
                    supportedLocales: AppLocalizations.supportedLocales,
                    builder: (context, child) => MediaQuery(
                      data: MediaQuery.of(
                        context,
                      ).copyWith(textScaler: TextScaler.linear(scale)),
                      child: child!,
                    ),
                    home: const NotificationsScreen(),
                  ),
                ),
              );
              await tester.pumpAndSettle();
              final context = tester.element(find.byType(NotificationsScreen));
              final theme = Theme.of(context);
              TextStyle? rendered(String value) => tester
                  .renderObject<RenderParagraph>(find.text(value).first)
                  .text
                  .style;
              final title = rendered(
                language == 'ar' ? 'طلب جديد' : 'New order',
              );
              final body = rendered(
                language == 'ar' ? 'وصل طلب جديد' : 'An order arrived',
              );
              final text = theme.textTheme;
              final styles = [
                text.displayLarge,
                text.displayMedium,
                text.displaySmall,
                text.headlineLarge,
                text.headlineMedium,
                text.headlineSmall,
                text.titleLarge,
                text.titleMedium,
                text.titleSmall,
                text.bodyLarge,
                text.bodyMedium,
                text.bodySmall,
                text.labelLarge,
                text.labelMedium,
                text.labelSmall,
                theme.appBarTheme.titleTextStyle,
                theme.listTileTheme.titleTextStyle,
                theme.listTileTheme.subtitleTextStyle,
                theme.elevatedButtonTheme.style!.textStyle!.resolve({}),
                WidgetStateProperty.resolveAs(
                  theme.inputDecorationTheme.labelStyle!,
                  {},
                ),
                theme.inputDecorationTheme.floatingLabelStyle,
                theme.inputDecorationTheme.errorStyle,
                title,
                body,
              ];
              for (final style in styles) {
                expect(style!.fontFamily, 'Zain');
              }
              expect(title!.fontSize, 14);
              expect(title.fontWeight, FontWeight.w700);
              expect(body!.fontSize, 14);
              expect(body.fontWeight, FontWeight.w400);
              if (language == 'ar') {
                arabic = styles;
              } else {
                expect(
                  styles,
                  arabic,
                  reason:
                      'Family/fallback, size, weight, height and spacing must not change with locale.',
                );
              }
              expect(tester.takeException(), isNull);
            }
            await tester.pumpWidget(const SizedBox.shrink());
          },
        );
      }
    }
  }
}
