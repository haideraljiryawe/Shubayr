import '../../features/auth/domain/user_role.dart';
import 'app_routes.dart';
import 'role_guard.dart';

/// A return address, never an instruction to repeat a cart/wishlist mutation.
abstract final class SignInDestination {
  static String resolve(String? raw, UserRole role) {
    final fallback = RoleGuard.homeFor(role);
    if (role != UserRole.customer || raw == null) return fallback;
    final uri = Uri.tryParse(raw);
    if (uri == null ||
        uri.hasScheme ||
        uri.hasAuthority ||
        !raw.startsWith('/') ||
        raw.contains('\\') ||
        uri.hasFragment) {
      return fallback;
    }
    const pages = {
      AppRoutes.home,
      AppRoutes.categories,
      AppRoutes.search,
      AppRoutes.account,
      AppRoutes.cart,
      AppRoutes.wishlist,
      AppRoutes.orders,
      AppRoutes.checkout,
      AppRoutes.addresses,
      AppRoutes.profile,
      AppRoutes.settings,
    };
    final detail =
        RegExp(r'^/(products|orders|categories)/[^/]+$').hasMatch(uri.path) ||
        RegExp(r'^/orders/[^/]+/(review|return)$').hasMatch(uri.path);
    return pages.contains(uri.path) || detail ? uri.toString() : fallback;
  }
}
