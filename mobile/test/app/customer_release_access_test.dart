import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/router/app_routes.dart';
import 'package:shubayr/app/router/role_guard.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';

void main() {
  test('customer-only builds reject work and legacy admin identities', () {
    for (final role in [
      'delivery_agent',
      'order_monitor',
      'owner',
      'admin',
      null,
    ]) {
      expect(UserRole.fromApi(role, customerOnly: true), UserRole.unsupported);
    }
    expect(UserRole.fromApi('customer', customerOnly: true), UserRole.customer);
    expect(
      UserRole.fromApi('delivery_agent', customerOnly: false),
      UserRole.delivery,
    );
    expect(
      UserRole.fromApi('order_monitor', customerOnly: false),
      UserRole.monitor,
    );
  });
  test('release deep links cannot enter preserved agent or monitor routes', () {
    for (final role in UserRole.values) {
      for (final route in [
        AppRoutes.delivery,
        '${AppRoutes.delivery}/assigned',
        AppRoutes.monitor,
      ]) {
        expect(RoleGuard.allows(role, route, customerOnly: true), isFalse);
        expect(
          RoleGuard.redirect(
            status: SessionStatus.signedIn,
            role: role,
            location: route,
            customerOnly: true,
          ),
          role == UserRole.customer ? AppRoutes.home : AppRoutes.signIn,
        );
      }
    }
    expect(
      RoleGuard.redirect(
        status: SessionStatus.signedIn,
        role: UserRole.delivery,
        location: AppRoutes.signIn,
        customerOnly: true,
      ),
      isNull,
    );
    expect(
      RoleGuard.allows(
        UserRole.customer,
        AppRoutes.checkout,
        customerOnly: true,
      ),
      isTrue,
    );
    expect(
      RoleGuard.redirect(
        status: SessionStatus.signedOut,
        role: UserRole.customer,
        location: AppRoutes.home,
        customerOnly: true,
      ),
      isNull,
    );
  });
}
