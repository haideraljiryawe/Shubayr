import '../../features/auth/domain/user_role.dart';
import 'app_routes.dart';

/// What the session layer knows at the moment a redirect is evaluated.
enum SessionStatus { restoring, signedOut, signedIn }

/// Route access rules.
///
/// Pure functions, deliberately independent of go_router and Flutter so they
/// can be unit tested directly.
///
/// Gating is **role-based only**. `api/openapi.yaml` exposes no `permissions`
/// on the user, so per-permission gating (e.g. hiding inventory from a
/// purchasing user) is not attempted here.
abstract final class RoleGuard {
  /// Where each role lands after sign-in.
  static String homeFor(UserRole role) => switch (role) {
    UserRole.customer => AppRoutes.home,
    UserRole.delivery => AppRoutes.delivery,
    UserRole.staff => AppRoutes.admin,
  };

  /// Catalog browsing is public in the contract (`/categories`, `/products`
  /// are `security: []`), so a signed-out visitor may browse home and the
  /// departments without an account.
  static bool isPublic(String location) =>
      location == AppRoutes.home ||
      location == AppRoutes.categories ||
      location.startsWith(AppRoutes.productsPrefix) ||
      location.startsWith(AppRoutes.signIn);

  static bool allows(UserRole role, String location) {
    final area = switch (role) {
      UserRole.customer => const [
        AppRoutes.home,
        AppRoutes.categories,
        AppRoutes.productsPrefix,
        AppRoutes.cart,
        AppRoutes.orders,
        AppRoutes.account,
      ],
      // Delivery and staff reach the account controls from a sheet inside
      // their own area, so they never enter the customer shell.
      UserRole.delivery => const [AppRoutes.delivery],
      UserRole.staff => const [AppRoutes.admin],
    };
    return area.any((path) => location.startsWith(path));
  }

  /// Returns the location to redirect to, or `null` to stay put.
  static String? redirect({
    required SessionStatus status,
    required UserRole role,
    required String location,
  }) {
    final atSplash = location == AppRoutes.splash;

    // Hold on the splash until the stored session has been restored.
    if (status == SessionStatus.restoring) {
      return atSplash ? null : AppRoutes.splash;
    }

    if (status == SessionStatus.signedOut) {
      if (atSplash) return AppRoutes.home;
      return isPublic(location) ? null : AppRoutes.signIn;
    }

    // Signed in: never leave the user on the splash or the sign-in flow.
    if (atSplash || location.startsWith(AppRoutes.signIn)) {
      return homeFor(role);
    }
    return allows(role, location) ? null : homeFor(role);
  }
}
