import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/wishlist/data/wishlist_item.dart';
import 'package:shubayr/features/wishlist/data/wishlist_repository_mock.dart';

typedef WishlistRequest = ({int page, int perPage});

class TestSession extends SessionController {
  TestSession({
    this.initial = const Session.signedIn(
      User(id: 'customer', role: 'customer'),
    ),
  });
  final Session initial;
  @override
  Future<Session> build() async => initial;
  void setSession(Session next) => state = AsyncData(next);
}

class RecordingWishlist extends WishlistRepositoryMock {
  RecordingWishlist({this.entries}) : super(delay: Duration.zero);
  final List<WishlistItem>? entries;
  final requests = <WishlistRequest>[];
  final added = <String>[];
  final removed = <String>[];
  Future<WishlistPage> Function(WishlistRequest)? onFetch;
  Future<WishlistItem> Function(String)? onAdd;
  Future<void> Function(String)? onRemove;

  @override
  Future<WishlistPage> fetchWishlist({int page = 1, int perPage = 20}) async {
    final request = (page: page, perPage: perPage);
    requests.add(request);
    if (onFetch != null) return onFetch!(request);
    final items = entries;
    if (items == null) return super.fetchWishlist(page: page, perPage: perPage);
    return WishlistPage(
      page: page,
      perPage: perPage,
      total: items.length,
      data: items.skip((page - 1) * perPage).take(perPage).toList(),
    );
  }

  @override
  Future<WishlistItem> add(String productId) async {
    added.add(productId);
    if (onAdd != null) return onAdd!(productId);
    if (entries == null) return super.add(productId);
    for (final item in entries!) {
      if (item.productId == productId) return item;
    }
    final item = WishlistItem(id: 'wl-$productId', productId: productId);
    entries!.insert(0, item);
    return item;
  }

  @override
  Future<void> remove(String productId) async {
    removed.add(productId);
    if (onRemove != null) return onRemove!(productId);
    if (entries == null) return super.remove(productId);
    entries!.removeWhere((item) => item.productId == productId);
  }
}
