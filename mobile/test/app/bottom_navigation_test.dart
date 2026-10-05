import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shubayr/app/shell/customer_shell.dart';
import 'package:shubayr/core/l10n/generated/app_localizations.dart';
import 'package:shubayr/core/theme/app_theme.dart';
import 'package:shubayr/core/theme/brand.dart';
import 'package:shubayr/core/theme/theme_context.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/cart/data/cart.dart';
import 'package:shubayr/features/cart/presentation/providers/cart_providers.dart';

const _customer = Session.signedIn(User(id: 'customer', role: 'customer'));
const _paths = ['/home', '/categories', '/cart', '/orders', '/account'];
final _capsule = find.byKey(const ValueKey('bottom-nav-capsule'));
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
  @override
  Future<Cart> build() async => const Cart();
}

Future<({_Session session, GoRouter router})> _pumpShell(
  WidgetTester tester, {
  bool signedIn = false,
  String language = 'ar',
  bool dark = false,
  double textScale = 1,
  double bottomInset = 0,
}) async {
  final session = _Session(signedIn ? _customer : const Session.signedOut());
  final container = ProviderContainer(
    overrides: [
      sessionControllerProvider.overrideWith(() => session),
      cartControllerProvider.overrideWith(_Cart.new),
    ],
  );
  final router = GoRouter(
    initialLocation: _paths.first,
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) =>
            CustomerShell(navigationShell: shell),
        branches: [
          for (final path in _paths)
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: path,
                  builder: (context, state) => Text('Page $path'),
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
            padding: EdgeInsets.only(bottom: bottomInset),
          ),
          child: child!,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return (session: session, router: router);
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
    for (final weight in ['Regular', 'Medium', 'SemiBold']) {
      fonts.addFont(rootBundle.load('assets/fonts/Cairo-$weight.ttf'));
    }
    await fonts.load();
  });
  for (final language in ['ar', 'en']) {
    for (final dark in [false, true]) {
      for (final width in [320.0, 360.0, 390.0, 599.0, 600.0, 899.0]) {
        testWidgets('$language dark=$dark width=$width: balanced 3/5 tabs', (
          tester,
        ) async {
          await tester.binding.setSurfaceSize(Size(width, 844));
          addTearDown(() => tester.binding.setSurfaceSize(null));
          for (final textScale in [1.0, 1.5]) {
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
              expect(bar.height, 104);
              expect(bar.bottom, 844);
              for (var i = 0; i < count; i++) {
                final rect = tester.getRect(_tabs.at(i));
                expect(rect.width, closeTo(width / count, 0.01));
                expect(rect.height, 70);
                final slot = language == 'ar' ? count - i - 1 : i;
                expect(rect.left, closeTo(slot * width / count, 0.01));
                final text = find.descendant(
                  of: _tabs.at(i),
                  matching: find.byType(Text),
                );
                final labelRect = _paintedRect(tester, text);
                expect(rect.inflate(0.01).contains(labelRect.topLeft), isTrue);
                expect(
                  rect.inflate(0.01).contains(labelRect.bottomRight),
                  isTrue,
                );
              }
              final pill = tester.getRect(_capsule);
              final active = tester.getRect(_tabs.first);
              expect(pill.center.dx, closeTo(active.center.dx, 0.01));
              expect(pill.width, lessThan(active.width));
              expect(pill.width, lessThanOrEqualTo(96.01));
              expect(pill.top, greaterThan(active.top));
              expect(pill.bottom, lessThan(active.bottom));
              final colors = tester.element(_capsule).colors;
              expect(
                (tester.widget<DecoratedBox>(_capsule).decoration
                        as BoxDecoration)
                    .color,
                colors.primarySoft,
              );
              final label = tester.widget<Text>(
                find.descendant(of: _tabs.first, matching: find.byType(Text)),
              );
              expect(label.style?.color, colors.primary);
              expect(label.style?.fontWeight, FontWeight.w600);
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
          await tester.binding.setSurfaceSize(const Size(320, 844));
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
          expect(tester.getSize(_tabs.last).height, 70);
          final scale = tester.widget<ScaleTransition>(
            find.descendant(
              of: _tabs.last,
              matching: find.byType(ScaleTransition),
            ),
          );
          expect(scale.scale.value, closeTo(1.05, 0.001));

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

  testWidgets(
    'Account stays selected across login/logout with stable height and safe area',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 844));
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
