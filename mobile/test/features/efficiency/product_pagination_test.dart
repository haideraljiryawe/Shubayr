import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/catalog/data/catalog_repository_mock.dart';
import 'package:shubayr/features/catalog/data/product.dart';
import 'package:shubayr/features/catalog/data/product_page.dart';
import 'package:shubayr/features/catalog/presentation/providers/catalog_providers.dart';
import 'package:shubayr/features/catalog/presentation/providers/product_list_controller.dart';

class PendingCatalog extends CatalogRepositoryMock {
  final requests =
      <({String? query, int page, Completer<ProductPage> result})>[];
  @override
  Future<ProductPage> fetchProducts({
    String? query,
    String? categoryId,
    num? minPrice,
    num? maxPrice,
    bool onSale = false,
    String? sort,
    int page = 1,
    int perPage = 20,
  }) {
    final result = Completer<ProductPage>();
    requests.add((query: query, page: page, result: result));
    return result.future;
  }
}

ProductPage page(int number, List<String> ids, {int total = 9}) => ProductPage(
  page: number,
  perPage: 8,
  total: total,
  data: [
    for (final id in ids)
      Product(
        id: id,
        categoryId: 'c',
        nameEn: 'Product',
        nameAr: 'منتج',
        effectivePrice: number,
      ),
  ],
);
void main() {
  late PendingCatalog repo;
  late ProviderContainer c;
  final provider = productListControllerProvider(const ProductQuery());
  setUp(() {
    repo = PendingCatalog();
    c = ProviderContainer(
      overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
    );
    c.listen(provider, (_, _) {});
  });
  tearDown(() => c.dispose());
  test(
    'append deduplicates IDs, preserves order and accepts newest snapshot',
    () async {
      repo.requests.last.result.complete(
        page(1, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']),
      );
      await c.pump();
      final controller = c.read(provider.notifier);
      controller.loadMore();
      controller.loadMore();
      expect(repo.requests, hasLength(2));
      repo.requests.last.result.complete(page(2, ['h', 'i', 'i']));
      await c.pump();
      expect(c.read(provider).items.map((p) => p.id), [
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
        'h',
        'i',
      ]);
      expect(c.read(provider).items[7].salePrice, 2);
      expect(c.read(provider).hasMore, isFalse);
    },
  );
  test(
    'query/filter replacement ignores late append and older search',
    () async {
      repo.requests.last.result.complete(page(1, ['a']));
      await c.pump();
      final controller = c.read(provider.notifier)..loadMore();
      final oldAppend = repo.requests.last;
      controller.updateQuery(const ProductQuery(text: 'old'));
      final oldSearch = repo.requests.last;
      controller.updateQuery(
        const ProductQuery(text: 'latest', categoryId: 'c'),
      );
      repo.requests.last.result.complete(page(1, ['latest'], total: 1));
      await c.pump();
      oldAppend.result.complete(page(2, ['stale']));
      oldSearch.result.complete(page(1, ['stale-search']));
      await c.pump();
      expect(c.read(provider).items.single.id, 'latest');
      expect(c.read(provider).hasMore, isFalse);
    },
  );
  test(
    'empty nonterminal page reports error, keeps prior items and retries same page',
    () async {
      repo.requests.last.result.complete(page(1, ['a']));
      await c.pump();
      final controller = c.read(provider.notifier)..loadMore();
      repo.requests.last.result.complete(page(2, [], total: 20));
      await c.pump();
      expect(c.read(provider).error, isNotNull);
      expect(c.read(provider).page, 1);
      controller.retry();
      expect(repo.requests.last.page, 2);
      repo.requests.last.result.complete(page(2, ['b'], total: 9));
      await c.pump();
      expect(c.read(provider).items.map((p) => p.id), ['a', 'b']);
      expect(c.read(provider).hasMore, isFalse);
    },
  );
  test(
    'short nonempty pages retain server end detection and wrong page metadata cannot advance',
    () async {
      repo.requests.last.result.complete(page(1, ['a'], total: 9));
      await c.pump();
      expect(c.read(provider).hasMore, isTrue);
      final controller = c.read(provider.notifier)..loadMore();
      repo.requests.last.result.complete(page(1, ['wrong'], total: 9));
      await c.pump();
      expect(c.read(provider).page, 1);
      expect(c.read(provider).items.single.id, 'a');
      expect(c.read(provider).error, isNotNull);
      controller.retry();
      expect(repo.requests.last.page, 2);
      repo.requests.last.result.complete(page(2, ['b'], total: 9));
      await c.pump();
      expect(c.read(provider).hasMore, isFalse);
    },
  );
}
