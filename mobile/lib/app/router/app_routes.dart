/// Every route path and name in one place.
abstract final class AppRoutes {
  static const splash = '/splash';

  static const signIn = '/sign-in';
  static const verifyOtp = '/sign-in/verify';

  // Customer shell branches.
  static const home = '/home';
  static const categories = '/categories';
  static const cart = '/cart';
  static const orders = '/orders';
  static const account = '/account';

  // Role areas.
  static const delivery = '/delivery';
  static const admin = '/admin';

  // Product detail, pushed full-screen over the shell.
  static const product = '/products/:id';

  /// Prefix shared by all product routes, for public-access checks.
  static const productsPrefix = '/products';

  // Product search / listing (public), full-screen over the shell.
  static const search = '/search';

  // Cross-area, full-screen pages any signed-in role can open with a back
  // button: the account-settings page (staff/delivery reach it here instead of
  // a bottom sheet) and the user's own profile editor.
  static const settings = '/settings';
  static const profile = '/profile';

  // Developer-only design gallery (reachable in debug builds only).
  static const design = '/design';

  static const signInName = 'sign-in';
  static const verifyOtpName = 'verify-otp';
  static const homeName = 'home';
  static const categoriesName = 'categories';
  static const cartName = 'cart';
  static const ordersName = 'orders';
  static const accountName = 'account';
  static const deliveryName = 'delivery';
  static const adminName = 'admin';
  static const productName = 'product';
  static const searchName = 'search';
  static const settingsName = 'settings';
  static const profileName = 'profile';
  static const designName = 'design';
}
