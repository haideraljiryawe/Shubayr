import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/shell/customer_shell.dart';
import 'package:shubayr/app/shell/customer_branch_transition.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/layout/app_layout.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/components/navigation_themes.dart';
import 'package:shubayr/core/theme/theme_context.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';

const _customer = Session.signedIn(User(id: 'customer', role: 'customer'));
const _paths = ['/home', '/categories', '/cart', '/orders', '/account'];
final _capsule = find.byKey(const ValueKey('bottom-nav-capsule'));
final _surface = find.byKey(const ValueKey('bottom-nav-surface'));
final _tabs = find.descendant(
  of: find.byType(CustomerShell),
  matching: find.byType(InkWell),
);

class _Session extends SessionController {
  _Session(this.initial);
  final Session initial;
  @override
  Future<Session> build() async => initial;
  void setSession(Session value) => state = AsyncData(value);
}

class _Cart extends CartController {
  _Cart(this.hasBadge);
  final bool hasBadge;
  @override
  Future<Cart> build() async => Cart(
    items: [
      if (hasBadge)
        const CartItem(
          id: 'line',
          productId: 'product',
          unitPrice: 1000,
          lineTotal: 1000,
        ),
    ],
  );
}

Future<({_Session session, GoRouter router})> _pumpShell(
  WidgetTester tester, {
  bool signedIn = false,
  bool cartBadge = false,
  String language = 'ar',
  bool dark = false,
  double textScale = 1,
  double bottomInset = 0,
  double sideInset = 0,
  double? viewPaddingBottom,
  double gestureInset = 0,
  double keyboardInset = 0,
  WidgetBuilder? pageBuilder,
}) async {
  final session = _Session(signedIn ? _customer : const Session.signedOut());
  final container = ProviderContainer(
    overrides: [
      sessionControllerProvider.overrideWith(() => session),
      cartControllerProvider.overrideWith(() => _Cart(cartBadge)),
    ],
  );
  final router = GoRouter(
    initialLocation: _paths.first,
    routes: [
      StatefulShellRoute(
        navigatorContainerBuilder: CustomerBranchTransition.containerBuilder,
        builder: (context, state, shell) =>
            CustomerShell(navigationShell: shell),
        branches: [
          for (final path in _paths)
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: path,
                  builder: (context, state) =>
                      pageBuilder?.call(context) ?? Text('Page $path'),
                  routes: [
                    GoRoute(
                      path: 'detail',
                      builder: (context, state) => Text('Detail $path'),
                    ),
                  ],
                ),
              ],
            ),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp.router(
        theme: dark
            ? AppTheme.dark(const Brand.bundled())
            : AppTheme.light(const Brand.bundled()),
        locale: Locale(language),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: router,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
            viewPadding: EdgeInsets.only(
              bottom: viewPaddingBottom ?? bottomInset,
            ),
            systemGestureInsets: EdgeInsets.only(bottom: gestureInset),
            viewInsets: EdgeInsets.only(bottom: keyboardInset),
            padding: EdgeInsets.only(
              bottom: bottomInset,
              left: sideInset,
              right: sideInset,
            ),
          ),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (session: session, router: router);
}

// Keep the platform MediaQuery and render constraints on the same breakpoint.
Future<void> _setSurfaceSize(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size * tester.view.devicePixelRatio;
  addTearDown(tester.view.resetPhysicalSize);
  await tester.binding.setSurfaceSize(size);
}

Rect _paintedRect(WidgetTester tester, Finder finder) {
  final box = tester.renderObject<RenderBox>(finder);
  return MatrixUtils.transformRect(
    box.getTransformTo(null),
    Offset.zero & box.size,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final fonts = FontLoader('Cairo');
    for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Cairo-$weight.ttf'));
    }
    await fonts.load();
  });
  for (final language in ['ar', 'en']) {
    for (final dark in [false, true]) {
      for (final width in [
        320.0,
        360.0,
        390.0,
        599.0,
        600.0,
        899.0,
        900.0,
        1199.0,
        1200.0,
        1535.0,
        1536.0,
        1920.0,
      ]) {
        testWidgets('$language dark=$dark width=$width: balanced 3/5 tabs', (
          tester,
        ) async {
          await _setSurfaceSize(tester, Size(width, 844));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          for (final textScale in [1.0, 1.5, 2.0]) {
            final harness = await _pumpShell(
              tester,
              language: language,
              dark: dark,
              textScale: textScale,
              bottomInset: 34,
            );
            for (final signedIn in [false, true]) {
              harness.session.setSession(
                signedIn ? _customer : const Session.signedOut(),
              );
              await tester.pumpAndSettle();
              final count = signedIn ? 5 : 3;
              expect(_tabs, findsNWidgets(count));
              final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
              final bar = tester.getRect(
                find.byWidget(scaffold.bottomNavigationBar!),
              );
              final expectedHeight = NavigationThemes.bottomBarHeight;
              expect(bar.height, closeTo(expectedHeight + 24.0, .01));
              expect(bar.bottom, 844);
              final surface = tester.getRect(_surface);
              final gutter = width < 600 ? 8.0 : 16.0;
              final geometry = NavigationThemes.bottomBarGeometry(
                width - 2 * gutter,
                count,
              );
              final expectedWidth = geometry.barWidth;
              expect(surface.width, closeTo(expectedWidth, .01));
              expect(surface.center.dx, closeTo(width / 2, .01));
              expect(surface.height, closeTo(expectedHeight, .01));
              expect(surface.bottom, closeTo(844 - 24.0, .01));
              for (var i = 0; i < count; i++) {
                final rect = tester.getRect(_tabs.at(i));
                expect(rect.width, closeTo(surface.width / count, 0.01));
                expect(rect.height, closeTo(44, .01));
                final slot = language == 'ar' ? count - i - 1 : i;
                expect(
                  rect.left,
                  closeTo(surface.left + slot * surface.width / count, 0.01),
                );
                expect(
                  find.descendant(of: _tabs.at(i), matching: find.byType(Text)),
                  findsNothing,
                );
                final iconRect = _paintedRect(
                  tester,
                  find.descendant(of: _tabs.at(i), matching: find.byType(Icon)),
                );
                expect(iconRect.center.dx, closeTo(rect.center.dx, .01));
                expect(iconRect.center.dy, closeTo(rect.center.dy, .01));
              }
              final pill = tester.getRect(_capsule);
              final active = tester.getRect(_tabs.first);
              expect(pill.center.dx, closeTo(active.center.dx, 0.01));
              expect(pill.width, lessThan(active.width));
              expect(pill.width + .01, greaterThanOrEqualTo(pill.height));
              expect(pill.width, closeTo(geometry.selected.width, .01));
              expect(pill.height, closeTo(math.min(52, pill.width), .01));
              expect(pill.top, greaterThan(surface.top));
              expect(pill.bottom, lessThan(surface.bottom));
              expect(pill.center.dy, closeTo(active.center.dy, .01));
              final colors = tester.element(_capsule).colors;
              expect(
                (tester.widget<DecoratedBox>(_capsule).decoration
                        as BoxDecoration)
                    .color,
                colors.primary.withValues(alpha: 0.20),
              );
              for (var i = 0; i < count; i++) {
                final icon = tester.widget<Icon>(
                  find.descendant(of: _tabs.at(i), matching: find.byType(Icon)),
                );
                expect(icon.size, 28);
                final foreground = i == 0
                    ? colors.primary
                    : Theme.of(
                        tester.element(_surface),
                      ).colorScheme.onSurface.withValues(alpha: 0.92);
                expect(icon.color, foreground);
              }
              expect(tester.takeException(), isNull);
            }
            await tester.pumpWidget(const SizedBox.shrink());
          }
        });
      }
    }
  }

  for (final language in ['ar', 'en']) {
    for (final signedIn in [false, true]) {
      testWidgets(
        '$language signedIn=$signedIn: sliding capsule and selection-only haptics',
        (tester) async {
          await _setSurfaceSize(tester, const Size(320, 844));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          final haptics = <Object?>[];
          tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            SystemChannels.platform,
            (call) async {
              if (call.method == 'HapticFeedback.vibrate') {
                haptics.add(call.arguments);
              }
              return null;
            },
          );
          addTearDown(
            () => tester.binding.defaultBinaryMessenger
                .setMockMethodCallHandler(SystemChannels.platform, null),
          );
          final harness = await _pumpShell(
            tester,
            signedIn: signedIn,
            language: language,
          );
          expect(haptics, isEmpty);
          final start = tester.getRect(_capsule);
          final endX = tester.getCenter(_tabs.last).dx;
          await tester.tap(_tabs.last);
          await tester.pump();
          expect(tester.getRect(_capsule), start);
          await tester.pump(const Duration(milliseconds: 120));
          expect(
            tester.getCenter(_capsule).dx,
            closeTo((start.center.dx + endX) / 2, 1),
          );
          await tester.pump(const Duration(milliseconds: 120));
          expect(tester.getCenter(_capsule).dx, closeTo(endX, 0.01));
          expect(
            harness.router.routeInformationProvider.value.uri.path,
            '/account',
          );
          expect(haptics, ['HapticFeedbackType.selectionClick']);
          expect(tester.getSize(_tabs.last).height, closeTo(44, .01));
          final scale = tester.widget<ScaleTransition>(
            find
                .descendant(
                  of: _tabs.last,
                  matching: find.byType(ScaleTransition),
                )
                .last,
          );
          expect(scale.scale.value, closeTo(1.10, 0.001));

          // Re-selection still resets the active branch, without another haptic.
          harness.router.go('/account/detail');
          await tester.pumpAndSettle();
          expect(haptics, hasLength(1));
          await tester.tap(_tabs.last);
          await tester.pumpAndSettle();
          expect(
            harness.router.routeInformationProvider.value.uri.path,
            '/account',
          );
          expect(haptics, hasLength(1));
          final branches = signedIn ? [0, 1, 2, 3, 4] : [0, 1, 4];
          for (var i = 0; i < branches.length; i++) {
            await tester.tap(_tabs.at(i));
            await tester.pumpAndSettle();
            expect(
              harness.router.routeInformationProvider.value.uri.path,
              _paths[branches[i]],
            );
            expect(
              tester.getCenter(_capsule).dx,
              closeTo(tester.getCenter(_tabs.at(i)).dx, 0.01),
            );
          }
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  for (final language in ['ar', 'en']) {
    for (final signedIn in [false, true]) {
      for (final dark in [false, true]) {
        testWidgets(
          'press state layer keeps icon scale; release selects and cancel does not: $language signedIn=$signedIn dark=$dark',
          (tester) async {
            await _setSurfaceSize(tester, const Size(320, 844));
            addTearDown(() => tester.binding.setSurfaceSize(null));
            final haptics = <Object?>[];
            tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
              SystemChannels.platform,
              (call) async {
                if (call.method == 'HapticFeedback.vibrate') {
                  haptics.add(call.arguments);
                }
                return null;
              },
            );
            addTearDown(
              () => tester.binding.defaultBinaryMessenger
                  .setMockMethodCallHandler(SystemChannels.platform, null),
            );
            final harness = await _pumpShell(
              tester,
              signedIn: signedIn,
              language: language,
              dark: dark,
            );
            final tab = _tabs.at(1);
            final touchBounds = tester.getRect(tab);
            final capsuleBefore = tester.getRect(_capsule);
            final icon = find.descendant(of: tab, matching: find.byType(Icon));
            final iconBefore = _paintedRect(tester, icon);
            final stateLayer = find.descendant(
              of: tab,
              matching: find.byType(AnimatedOpacity),
            );
            final expansion = find.descendant(
              of: tab,
              matching: find.byKey(
                const ValueKey('bottom-nav-press-expansion'),
              ),
            );
            final pressClip = find.descendant(
              of: tab,
              matching: find.byKey(const ValueKey('bottom-nav-state-layer')),
            );
            expect(tester.widget<AnimatedOpacity>(stateLayer).opacity, 0);
            final ink = tester.widget<InkWell>(tab);
            expect(ink.splashFactory, NoSplash.splashFactory);
            expect(ink.splashColor, Colors.transparent);
            expect(ink.highlightColor, Colors.transparent);
            for (final state in [
              WidgetState.pressed,
              WidgetState.hovered,
              WidgetState.focused,
            ]) {
              expect(ink.overlayColor!.resolve({state}), Colors.transparent);
            }
            // Even an edge tap expands the background around the slot center.
            final press = await tester.startGesture(
              Offset(touchBounds.left + 1, touchBounds.center.dy),
            );
            await tester.pump(const Duration(milliseconds: 120));
            expect(
              tester.widget<ScaleTransition>(expansion).scale.value,
              closeTo(.50, .001),
            );
            await tester.pump(const Duration(milliseconds: 65));
            expect(
              tester.widget<ScaleTransition>(expansion).scale.value,
              inExclusiveRange(.50, 1),
            );
            expect(
              _paintedRect(tester, pressClip).center.dx,
              closeTo(touchBounds.center.dx, .01),
            );
            expect(
              _paintedRect(tester, pressClip).center.dy,
              closeTo(touchBounds.center.dy, .01),
            );
            await tester.pump(const Duration(milliseconds: 65));
            expect(tester.widget<ScaleTransition>(expansion).scale.value, 1);
            expect(tester.widget<AnimatedOpacity>(stateLayer).opacity, .10);
            expect(
              tester.widget<AnimatedOpacity>(stateLayer).duration,
              const Duration(milliseconds: 130),
            );
            expect(
              _paintedRect(tester, icon).width,
              closeTo(iconBefore.width, 0.01),
            );
            expect(tester.getRect(tab), touchBounds);
            expect(tester.getRect(_capsule), capsuleBefore);
            expect(haptics, isEmpty);
            expect(
              harness.router.routeInformationProvider.value.uri.path,
              '/home',
            );
            await press.up();
            await tester.pump();
            expect(tester.widget<AnimatedOpacity>(stateLayer).opacity, 0);
            expect(
              tester.widget<AnimatedOpacity>(stateLayer).duration,
              const Duration(milliseconds: 160),
            );
            await tester.pump(const Duration(milliseconds: 120));
            expect(tester.widget<ScaleTransition>(expansion).scale.value, 1);
            final destinationX = tester.getCenter(tab).dx;
            expect(
              tester.getCenter(_capsule).dx,
              closeTo((capsuleBefore.center.dx + destinationX) / 2, 1),
            );
            await tester.pumpAndSettle();
            final contentScale = tester.widget<ScaleTransition>(
              find
                  .descendant(of: tab, matching: find.byType(ScaleTransition))
                  .last,
            );
            expect(contentScale.scale.value, closeTo(1.10, .001));
            expect(tester.getRect(tab), touchBounds);
            expect(haptics, ['HapticFeedbackType.selectionClick']);
            expect(
              harness.router.routeInformationProvider.value.uri.path,
              '/categories',
            );
            expect(_paintedRect(tester, icon).width, closeTo(28 * 1.10, .01));
            final selectedPress = await tester.startGesture(
              tester.getCenter(tab),
            );
            await tester.pump(const Duration(milliseconds: 120));
            await tester.pump(const Duration(milliseconds: 100));
            expect(_paintedRect(tester, icon).width, closeTo(28 * 1.10, .01));
            expect(tester.widget<AnimatedOpacity>(stateLayer).opacity, .07);
            expect(tester.getRect(tab), touchBounds);
            await selectedPress.cancel();
            await tester.pumpAndSettle();
            expect(_paintedRect(tester, icon).width, closeTo(28 * 1.10, .01));
            final cancel = await tester.startGesture(
              tester.getCenter(_tabs.last),
            );
            await tester.pump(const Duration(milliseconds: 120));
            await tester.pump(const Duration(milliseconds: 100));
            await cancel.cancel();
            await tester.pumpAndSettle();
            expect(
              tester
                  .widget<ScaleTransition>(
                    find
                        .descendant(
                          of: _tabs.last,
                          matching: find.byType(ScaleTransition),
                        )
                        .first,
                  )
                  .scale
                  .value,
              1,
            );
            expect(
              harness.router.routeInformationProvider.value.uri.path,
              '/categories',
            );
            expect(haptics, hasLength(1));
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }

  for (final selected in [false, true]) {
    for (final cancel in [false, true]) {
      for (final dark in [false, true]) {
        testWidgets(
          'hold feedback stays visible until release selected=$selected cancel=$cancel dark=$dark',
          (tester) async {
            final harness = await _pumpShell(tester, dark: dark);
            final tab = selected ? _tabs.first : _tabs.at(1);
            final icon = find.descendant(of: tab, matching: find.byType(Icon));
            final iconBefore = _paintedRect(tester, icon);
            final expansion = find.descendant(
              of: tab,
              matching: find.byKey(
                const ValueKey('bottom-nav-press-expansion'),
              ),
            );
            final layer = find.descendant(
              of: tab,
              matching: find.byType(AnimatedOpacity),
            );
            double paintedOpacity() => tester
                .widget<FadeTransition>(
                  find.descendant(
                    of: layer,
                    matching: find.byType(FadeTransition),
                  ),
                )
                .opacity
                .value;
            final opacity = selected ? .07 : .10;
            final press = await tester.startGesture(tester.getCenter(tab));
            await tester.pump(const Duration(milliseconds: 120));
            await tester.pump(const Duration(milliseconds: 130));
            expect(paintedOpacity(), closeTo(opacity, .001));
            expect(tester.widget<ScaleTransition>(expansion).scale.value, 1);
            // Cross the Tooltip long-press deadline, then continue holding.
            for (final duration in [
              const Duration(seconds: 2),
              const Duration(seconds: 30),
            ]) {
              await tester.pump(duration);
              await tester.pump(const Duration(milliseconds: 200));
              expect(
                tester.widget<InkWell>(tab).statesController!.value,
                contains(WidgetState.pressed),
              );
              expect(paintedOpacity(), closeTo(opacity, .001));
              expect(tester.widget<ScaleTransition>(expansion).scale.value, 1);
              expect(_paintedRect(tester, icon), iconBefore);
            }
            if (cancel) {
              await press.cancel();
            } else {
              await press.up();
            }
            await tester.pump();
            expect(tester.widget<AnimatedOpacity>(layer).opacity, 0);
            expect(tester.widget<ScaleTransition>(expansion).scale.value, 1);
            await tester.pump(const Duration(milliseconds: 80));
            expect(paintedOpacity(), inExclusiveRange(0, opacity));
            await tester.pump(const Duration(milliseconds: 80));
            expect(paintedOpacity(), 0);
            expect(tester.widget<ScaleTransition>(expansion).scale.value, 1);
            expect(_paintedRect(tester, icon), iconBefore);
            // Long press still shows a tooltip, without selecting a new branch.
            expect(
              harness.router.routeInformationProvider.value.uri.path,
              '/home',
            );
            Tooltip.dismissAllToolTips();
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }

  for (final selected in [false, true]) {
    for (final cancel in [false, true]) {
      testWidgets(
        'early release fades at full size selected=$selected cancel=$cancel',
        (tester) async {
          await _pumpShell(tester);
          final tab = selected ? _tabs.first : _tabs.at(1);
          final expansion = find.descendant(
            of: tab,
            matching: find.byKey(const ValueKey('bottom-nav-press-expansion')),
          );
          final layer = find.descendant(
            of: tab,
            matching: find.byType(AnimatedOpacity),
          );
          final fade = find.descendant(
            of: layer,
            matching: find.byType(FadeTransition),
          );
          final press = await tester.startGesture(tester.getCenter(tab));
          await tester.pump(const Duration(milliseconds: 120));
          await tester.pump(const Duration(milliseconds: 30));
          expect(
            tester.widget<ScaleTransition>(expansion).scale.value,
            inExclusiveRange(.5, 1),
          );
          if (cancel) {
            await press.cancel();
          } else {
            await press.up();
          }
          await tester.pump();
          expect(tester.widget<AnimatedOpacity>(layer).opacity, 0);
          expect(tester.widget<ScaleTransition>(expansion).scale.value, 1);
          expect(
            tester.widget<FadeTransition>(fade).opacity.value,
            greaterThan(0),
          );
          await tester.pump(const Duration(milliseconds: 160));
          expect(tester.widget<FadeTransition>(fade).opacity.value, 0);
          expect(tester.widget<ScaleTransition>(expansion).scale.value, 1);
          await tester.pumpAndSettle();
        },
      );
    }
    testWidgets(
      'leaving a tooltip hold fades without retargeting selected=$selected',
      (tester) async {
        final harness = await _pumpShell(tester);
        final tab = selected ? _tabs.first : _tabs.at(1);
        final bounds = tester.getRect(tab);
        final layer = find.descendant(
          of: tab,
          matching: find.byType(AnimatedOpacity),
        );
        final press = await tester.startGesture(bounds.center);
        await tester.pump(const Duration(milliseconds: 120));
        await tester.pump(const Duration(milliseconds: 130));
        await tester.pump(const Duration(seconds: 2));
        expect(
          tester.widget<InkWell>(tab).statesController!.value,
          contains(WidgetState.pressed),
        );
        await press.moveTo(Offset(bounds.center.dx, bounds.top - 10));
        await tester.pump();
        expect(tester.widget<AnimatedOpacity>(layer).opacity, 0);
        await tester.pump(const Duration(milliseconds: 160));
        final fade = find.descendant(
          of: layer,
          matching: find.byType(FadeTransition),
        );
        expect(tester.widget<FadeTransition>(fade).opacity.value, 0);
        await press.moveTo(bounds.center);
        await tester.pump();
        expect(tester.widget<AnimatedOpacity>(layer).opacity, 0);
        await press.up();
        expect(harness.router.routeInformationProvider.value.uri.path, '/home');
        Tooltip.dismissAllToolTips();
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final bottomInset in [0.0, 8.0, 21.0, 34.0, 48.0]) {
    testWidgets(
      'floating surface respects safe area $bottomInset and body bounds',
      (tester) async {
        await _setSurfaceSize(tester, const Size(320, 844));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await _pumpShell(
          tester,
          signedIn: true,
          bottomInset: bottomInset,
          sideInset: 20,
        );
        final surface = tester.getRect(_surface);
        expect(surface.left, closeTo(25.6, .01));
        expect(surface.right, closeTo(294.4, .01));
        expect(
          surface.bottom,
          closeTo(844 - math.max(0, bottomInset - 10), .01),
        );
        expect(surface.height, closeTo(64, .01));
        expect(
          tester.getRect(_capsule).center.dy,
          closeTo(surface.center.dy, .01),
        );
        for (var i = 0; i < 5; i++) {
          final target = tester.getRect(_tabs.at(i));
          expect(target.height, closeTo(44, .01));
          expect(target.bottom, closeTo(surface.bottom - 10, .01));
          expect(target.bottom, lessThan(surface.bottom + 0.01));
        }
        final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
        final body = tester.getRect(find.byWidget(scaffold.body!));
        expect(scaffold.extendBody, isTrue);
        expect(body.bottom, 844);
        expect(body.bottom, greaterThanOrEqualTo(surface.bottom));
        final scope = tester.widget<BottomNavigationInset>(
          find.byType(BottomNavigationInset),
        );
        expect(scope.bottom, closeTo(64 + math.max(0, bottomInset - 10), .01));
        final material = tester.widget<Material>(_surface);
        expect(material.color, Colors.white);
        final clip = find
            .ancestor(of: _surface, matching: find.byType(ClipRRect))
            .first;
        expect(tester.getRect(clip), surface);
        final outline = material.shape! as RoundedRectangleBorder;
        expect(
          tester.widget<ClipRRect>(clip).borderRadius,
          outline.borderRadius,
        );
        expect(outline.side.width, 0.8);
        expect(
          outline.side.color,
          tester.element(_surface).colors.textPrimary.withValues(alpha: 0.22),
        );
        expect(
          find.ancestor(of: _surface, matching: find.byType(BackdropFilter)),
          findsNothing,
        );
        final shadow =
            tester
                    .widget<DecoratedBox>(
                      find.byKey(const ValueKey('bottom-nav-shadow')),
                    )
                    .decoration
                as BoxDecoration;
        expect(shadow.color, isNull);
        expect(shadow.boxShadow!.single.blurRadius, 24);
        expect(shadow.boxShadow!.single.spreadRadius, 0);
        expect(shadow.boxShadow!.single.offset, const Offset(0, 4));
        expect(shadow.boxShadow!.single.color.a, closeTo(0.11, 0.001));
        final outer = outline.borderRadius.resolve(TextDirection.rtl);
        final capsule =
            tester.widget<DecoratedBox>(_capsule).decoration as BoxDecoration;
        final inner = capsule.borderRadius!.resolve(TextDirection.rtl);
        expect(
          outer.topLeft.x,
          closeTo(
            inner.topLeft.x +
                (surface.height - tester.getSize(_capsule).height) / 2,
            .01,
          ),
        );
        expect(outer.topLeft.x, closeTo(surface.height / 2, .01));
        // End tabs stay readable inside the rounded surface, even when selected.
        for (var i = 0; i < 5; i++) {
          await tester.tap(_tabs.at(i));
          await tester.pumpAndSettle();
          final shape = outer.toRRect(surface);
          for (final type in [Icon]) {
            final rect = _paintedRect(
              tester,
              find.descendant(of: _tabs.at(i), matching: find.byType(type)),
            );
            expect(shape.contains(rect.topLeft), isTrue);
            expect(shape.contains(rect.topRight), isTrue);
            expect(shape.contains(rect.bottomLeft), isTrue);
            expect(
              shape.contains(rect.bottomRight),
              isTrue,
              reason: 'tab=$i type=$type rect=$rect shape=$shape',
            );
          }
          expect(tester.takeException(), isNull);
        }
      },
    );
  }

  for (final signedIn in [false, true]) {
    testWidgets(
      'scroll content paints behind the bar and last item is reachable signedIn=$signedIn',
      (tester) async {
        await _setSurfaceSize(tester, const Size(320, 844));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final scroll = ScrollController();
        addTearDown(scroll.dispose);
        var tapped = false;
        await _pumpShell(
          tester,
          signedIn: signedIn,
          bottomInset: 34,
          pageBuilder: (context) => Scaffold(
            body: ListView.builder(
              controller: scroll,
              padding: AppLayout.scrollInsets(context),
              itemExtent: 80,
              itemCount: 30,
              itemBuilder: (_, i) => GestureDetector(
                key: ValueKey('overlay-row-$i'),
                onTap: () => tapped = true,
                child: ColoredBox(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  child: Text('Row $i'),
                ),
              ),
            ),
          ),
        );
        final viewport = tester.getRect(find.byType(ListView));
        expect(viewport.bottom, 844);
        final surface = tester.getRect(_surface);
        final underBar = tester.getRect(
          find.byKey(const ValueKey('overlay-row-9')),
        );
        expect(underBar.overlaps(surface), isTrue);
        scroll.jumpTo(scroll.position.maxScrollExtent);
        await tester.pumpAndSettle();
        final last = find.byKey(const ValueKey('overlay-row-29'));
        expect(tester.getRect(last).bottom, lessThan(surface.top));
        await tester.tap(last);
        expect(tapped, isTrue);
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final language in ['ar', 'en']) {
    for (final dark in [false, true]) {
      for (final inset in [0.0, 8.0, 21.0, 34.0, 48.0]) {
        testWidgets(
          'auth changes during capsule motion $language dark=$dark inset=$inset',
          (tester) async {
            await _setSurfaceSize(tester, const Size(320, 844));
            addTearDown(() => tester.binding.setSurfaceSize(null));
            final harness = await _pumpShell(
              tester,
              language: language,
              dark: dark,
              bottomInset: inset,
              cartBadge: true,
            );
            final bounds = tester.getRect(_surface);
            for (final branch in [2, 3, 4]) {
              for (final elapsed in [0, 120, 240]) {
                expect(_tabs, findsNWidgets(3));
                await tester.tap(_tabs.last);
                await tester.pump();
                harness.session.setSession(_customer);
                await tester.pumpAndSettle();
                expect(tester.takeException(), isNull);
                expect(_tabs, findsNWidgets(5));
                expect(
                  tester.getCenter(_capsule).dx,
                  closeTo(tester.getCenter(_tabs.last).dx, .01),
                );
                expect(tester.getRect(_surface), bounds);
                await tester.tap(_tabs.first);
                await tester.pumpAndSettle();
                await tester.tap(_tabs.at(branch));
                await tester.pump();
                await tester.pump(Duration(milliseconds: elapsed));
                harness.session.setSession(const Session.signedOut());
                await tester.pump();
                expect(tester.takeException(), isNull);
                expect(_tabs, findsNWidgets(3));
                expect(tester.getRect(_surface), bounds);
                await tester.pumpAndSettle();
                expect(tester.takeException(), isNull);
                final selected = find.descendant(
                  of: _surface,
                  matching: find.byWidgetPredicate(
                    (w) => w is Semantics && w.properties.selected == true,
                  ),
                );
                expect(selected, findsOneWidget);
                expect(
                  tester.getCenter(_capsule).dx,
                  closeTo(
                    tester.getCenter(branch == 4 ? _tabs.last : _tabs.first).dx,
                    .01,
                  ),
                );
                // The shell only reflects auth visibility; routing still belongs
                // to the router (covered separately with the production guards).
                expect(
                  harness.router.routeInformationProvider.value.uri.path,
                  _paths[branch],
                );
              }
            }
          },
        );
      }
    }
  }

  for (final branch in [2, 3, 4]) {
    testWidgets(
      'auth change while pressing branch $branch does not retarget the gesture',
      (tester) async {
        final harness = await _pumpShell(
          tester,
          signedIn: true,
          cartBadge: true,
        );
        final press = await tester.startGesture(
          tester.getCenter(_tabs.at(branch)),
        );
        await tester.pump(const Duration(milliseconds: 120));
        await tester.pump(const Duration(milliseconds: 100));
        harness.session.setSession(const Session.signedOut());
        await tester.pump();
        expect(tester.takeException(), isNull);
        await press.up();
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(_tabs, findsNWidgets(3));
        expect(
          harness.router.routeInformationProvider.value.uri.path,
          branch == 4 ? '/account' : '/home',
        );
        expect(
          tester
              .widget<AnimatedOpacity>(
                find
                    .descendant(
                      of: _tabs.last,
                      matching: find.byType(AnimatedOpacity),
                    )
                    .first,
              )
              .opacity,
          0,
        );
      },
    );
  }

  for (final metrics in [
    (padding: 0.0, view: 0.0, gesture: 24.0, keyboard: 0.0, offset: 14.0),
    (padding: 21.0, view: 21.0, gesture: 32.0, keyboard: 0.0, offset: 22.0),
    (padding: 48.0, view: 48.0, gesture: 0.0, keyboard: 0.0, offset: 38.0),
    (padding: 0.0, view: 34.0, gesture: 0.0, keyboard: 300.0, offset: 24.0),
  ]) {
    testWidgets(
      'system UI and gesture exclusions position the whole bar: $metrics',
      (tester) async {
        await _setSurfaceSize(tester, const Size(320, 844));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        await _pumpShell(
          tester,
          bottomInset: metrics.padding,
          viewPaddingBottom: metrics.view,
          gestureInset: metrics.gesture,
          keyboardInset: metrics.keyboard,
        );
        final rect = tester.getRect(_surface);
        expect(rect.height, closeTo(64, .01));
        expect(rect.bottom, closeTo(844 - metrics.offset, .01));
        for (var i = 0; i < 3; i++) {
          expect(tester.getRect(_tabs.at(i)).top, closeTo(rect.top + 10, .01));
          expect(
            tester.getRect(_tabs.at(i)).bottom,
            closeTo(rect.bottom - 10, .01),
          );
        }
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'Account stays selected across login/logout with stable height and safe area',
    (tester) async {
      await _setSurfaceSize(tester, const Size(320, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final harness = await _pumpShell(tester, bottomInset: 34);
      await tester.tap(_tabs.last);
      await tester.pumpAndSettle();
      final before = tester.getRect(_tabs.last);
      for (final session in [_customer, const Session.signedOut()]) {
        harness.session.setSession(session);
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 120));
        expect(tester.getRect(_tabs.last).top, before.top);
        expect(tester.getRect(_tabs.last).bottom, before.bottom);
        await tester.pumpAndSettle();
        expect(
          harness.router.routeInformationProvider.value.uri.path,
          '/account',
        );
        expect(
          tester.getCenter(_capsule).dx,
          closeTo(tester.getCenter(_tabs.last).dx, 0.01),
        );
        expect(tester.takeException(), isNull);
      }
    },
  );
}
