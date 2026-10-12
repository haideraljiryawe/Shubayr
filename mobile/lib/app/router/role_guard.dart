import '../../features/auth/domain/user_role.dart';
import 'app_routes.dart';

/// What the session layer knows at the moment a redirect is evaluated.
enum SessionStatus { restoring, signedOut, signedIn }

/// Route access rules.
///
/// Pure functions, deliberately independent of go_router and Flutter so they
/// can be unit tested directly.
///
/// Phone sessions never enter Web Admin, even when the same person owns a
/// staff account. Unknown roles are denied instead of receiving shopping access.
abstract final class RoleGuard {
  /// Where each role lands after sign-in.
  static String homeFor(UserRole role) => switch (role) {
    UserRole.customer => AppRoutes.home,
    UserRole.delivery => AppRoutes.delivery,
    UserRole.monitor => AppRoutes.monitor,
    UserRole.unsupported => AppRoutes.signIn,
  };

  /// Catalog browsing is public in the contract (`/categories`, `/products`
  /// are `security: []`), so a signed-out visitor may browse home and the
  /// departments without an account. Account is public too: for a guest it is
  /// the app-settings screen (language, appearance, and a sign-in prompt), not
  /// account data — those preferences must be reachable without signing in.
  static bool isPublic(String location) =>
      location == AppRoutes.home ||
      location == AppRoutes.categories ||
      location.startsWith('${AppRoutes.categories}/') ||
      location == AppRoutes.account ||
      location == AppRoutes.search ||
      location.startsWith(AppRoutes.productsPrefix) ||
      location.startsWith(AppRoutes.signIn);

  static bool allows(UserRole role, String location) {
    // Cross-area pages any signed-in user may open regardless of their area:
    // the shared app-settings page and their own profile editor.
    if (role == UserRole.unsupported) return false;
    const shared = [
      AppRoutes.settings,
      AppRoutes.profile,
      AppRoutes.notifications,
    ];
    if (shared.contains(location)) return true;

    final area = switch (role) {
      UserRole.customer => const [
        AppRoutes.home,
        AppRoutes.categories,
        AppRoutes.productsPrefix,
        AppRoutes.search,
        AppRoutes.cart,
        AppRoutes.orders,
        AppRoutes.account,
        AppRoutes.addresses,
        AppRoutes.checkout,
        AppRoutes.wishlist,
      ],
      // Delivery agents and monitors reach the account controls from a sheet inside
      // their own area, so they never enter the customer shell.
      UserRole.delivery => const [AppRoutes.delivery],
      UserRole.monitor => const [AppRoutes.monitor],
      UserRole.unsupported => const <String>[],
    };
    return area.any(
      (path) => location == path || location.startsWith('$path/'),
    );
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
