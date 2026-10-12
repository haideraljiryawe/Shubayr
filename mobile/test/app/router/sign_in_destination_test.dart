import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/app/router/sign_in_destination.dart';
import 'package:shubayr/features/auth/domain/user_role.dart';

void main() {
  test('accepts only known local customer destinations', () {
    for (final path in [
      '/products/p5',
      '/categories/cat-electronics',
      '/wishlist',
      '/search?q=coffee',
      '/orders/order-1042/review',
      '/orders/order-1042/return',
    ]) {
      expect(SignInDestination.resolve(path, UserRole.customer), path);
    }
    for (final path in [
      null,
      'https://example.com',
      '//example.com',
      '/sign-in',
      '/splash',
      '/admin',
      '/delivery',
      '/unknown',
      '/orders-not-a-route',
      '/products/p5#external',
      '/\\example.com',
    ]) {
      expect(SignInDestination.resolve(path, UserRole.customer), '/home');
    }
  });
  test('return destinations do not bypass role boundaries', () {
    expect(
      SignInDestination.resolve('/products/p5', UserRole.delivery),
      '/delivery',
    );
    expect(
      SignInDestination.resolve('/cart', UserRole.monitor),
      '/monitor/orders',
    );
  });
}
