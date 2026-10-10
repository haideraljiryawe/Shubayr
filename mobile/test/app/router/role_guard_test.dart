import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/app/router/role_guard.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';

void main() {
  group('UserRole.fromApi', () {
    test('maps only the current app contract roles', () {
      expect(UserRole.fromApi('customer'), UserRole.customer);
      expect(UserRole.fromApi('delivery_agent'), UserRole.delivery);
      expect(UserRole.fromApi('order_monitor'), UserRole.monitor);
    });
    test('rejects unknown and legacy staff roles', () {
      for (final role in [
        null,
        '',
        'admin',
        'manager',
        'purchasing',
        'warehouse',
        'delivery',
        'unknown',
      ]) {
        expect(UserRole.fromApi(role), UserRole.unsupported);
      }
    });
  });

  group('RoleGuard.redirect', () {
    String? redirect(SessionStatus status, UserRole role, String location) =>
        RoleGuard.redirect(status: status, role: role, location: location);

    test('holds on the splash while the session is restoring', () {
      expect(
        redirect(SessionStatus.restoring, UserRole.customer, AppRoutes.home),
        AppRoutes.splash,
      );
      expect(
        redirect(SessionStatus.restoring, UserRole.customer, AppRoutes.splash),
        isNull,
      );
    });

    test('signed-out visitors may browse home, account settings and sign in', () {
      // Account is public for a guest: it is the app-settings screen (language,
      // appearance, sign-in prompt), not account data.
      for (final route in [
        AppRoutes.home,
        AppRoutes.categories,
        "${AppRoutes.categories}/cat-electronics",
        AppRoutes.account,
        AppRoutes.signIn,
        AppRoutes.verifyOtp,
      ]) {
        expect(
          redirect(SessionStatus.signedOut, UserRole.customer, route),
          isNull,
          reason: route,
        );
      }
    });

    test('signed-out visitors are sent to sign-in for private routes', () {
      for (final route in [
        AppRoutes.cart,
        AppRoutes.orders,
        AppRoutes.addresses,
      ]) {
        expect(
          redirect(SessionStatus.signedOut, UserRole.customer, route),
          AppRoutes.signIn,
          reason: route,
        );
      }
    });

    test('each role lands in its own area after signing in', () {
      expect(
        redirect(SessionStatus.signedIn, UserRole.customer, AppRoutes.splash),
        AppRoutes.home,
      );
      expect(
        redirect(SessionStatus.signedIn, UserRole.delivery, AppRoutes.signIn),
        AppRoutes.delivery,
      );
      expect(
        redirect(SessionStatus.signedIn, UserRole.monitor, AppRoutes.splash),
        AppRoutes.monitor,
      );
    });

    test('roles cannot enter another role area', () {
      expect(
        redirect(SessionStatus.signedIn, UserRole.customer, AppRoutes.monitor),
        AppRoutes.home,
      );
      expect(
        redirect(SessionStatus.signedIn, UserRole.delivery, AppRoutes.cart),
        AppRoutes.delivery,
      );
      expect(
        redirect(SessionStatus.signedIn, UserRole.monitor, AppRoutes.delivery),
        AppRoutes.monitor,
      );
    });

    test('roles stay put inside their own area', () {
      expect(
        redirect(SessionStatus.signedIn, UserRole.customer, AppRoutes.cart),
        isNull,
      );
      expect(
        redirect(
          SessionStatus.signedIn,
          UserRole.customer,
          AppRoutes.addresses,
        ),
        isNull,
      );
      expect(
        redirect(
          SessionStatus.signedIn,
          UserRole.customer,
          AppRoutes.categories,
        ),
        isNull,
      );
      expect(
        redirect(SessionStatus.signedIn, UserRole.delivery, AppRoutes.delivery),
        isNull,
      );
      expect(
        redirect(SessionStatus.signedIn, UserRole.monitor, AppRoutes.monitor),
        isNull,
      );
    });
  });
}
