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
  static const designName = 'design';
}
