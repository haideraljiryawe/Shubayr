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
      <
        ({
          bool onSale,
          int page,
          String? category,
          String? query,
          num? min,
          num? max,
          String? sort,
          Completer<ProductPage> result,
        })
      >[];
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
    requests.add((
      onSale: onSale,
      page: page,
      category: categoryId,
      query: query,
      min: minPrice,
      max: maxPrice,
      sort: sort,
      result: result,
    ));
    return result.future;
  }
}

ProductPage page(int n, String prefix) => ProductPage(
  page: n,
  perPage: 8,
  total: 16,
  data: [
    for (var i = 0; i < 8; i++)
      Product(
        id: '$prefix-$i',
        categoryId: 'c',
        nameEn: 'Offer',
        nameAr: 'عرض',
      ),
  ],
);
Future<void> flush() => Future<void>.delayed(Duration.zero);
void main() {
  late PendingCatalog repo;
  late ProviderContainer container;
  late ProductListController controller;
  const seed = ProductQuery(
    onSale: true,
    categoryId: 'c',
    text: 'Offer',
    minPrice: 10,
    maxPrice: 20,
    sort: 'price_asc',
  );
  final provider = productListControllerProvider(seed);
  setUp(() {
    repo = PendingCatalog();
    container = ProviderContainer(
      retry: (retryCount, error) => null,
      overrides: [catalogRepositoryProvider.overrideWithValue(repo)],
    );
    container.listen(provider, (_, _) {});
    controller = container.read(provider.notifier);
  });
  tearDown(() => container.dispose());
  test(
    'offer append retry retains cards, page and all combined filters',
    () async {
      repo.requests.last.result.complete(page(1, 'first'));
      await flush();
      controller.loadMore();
      repo.requests.last.result.completeError(StateError('offline'));
      await flush();
      expect(container.read(provider).items.length, 8);
      controller.loadMore();
      expect(repo.requests.length, 2);
      controller.retry();
      expect(repo.requests.map((r) => r.page), [1, 2, 2]);
      for (final r in repo.requests) {
        expect(r.onSale, isTrue);
        expect(r.category, 'c');
        expect(r.query, 'Offer');
        expect(r.min, 10);
        expect(r.max, 20);
        expect(r.sort, 'price_asc');
      }
      repo.requests.last.result.complete(page(2, 'second'));
      await flush();
      expect(container.read(provider).items.length, 16);
      expect(container.read(provider).hasMore, isFalse);
    },
  );
  test(
    'rapid offers/all/offers ignores stale success and stale error',
    () async {
      controller.updateQuery(seed.copyWith(onSale: false));
      controller.updateQuery(seed);
      expect(repo.requests.map((r) => r.onSale), [true, false, true]);
      expect(repo.requests.every((r) => r.page == 1), isTrue);
      repo.requests.last.result.complete(page(1, 'fresh'));
      await flush();
      repo.requests[0].result.complete(page(1, 'stale'));
      await flush();
      repo.requests[1].result.completeError(StateError('stale error'));
      await flush();
      expect(container.read(provider).items.first.id, 'fresh-0');
      expect(container.read(provider).error, isNull);
    },
  );
  test('initial retry retains the offers filter', () async {
    repo.requests.first.result.completeError(StateError('offline'));
    await flush();
    controller.retry();
    expect(repo.requests.last.onSale, isTrue);
    expect(repo.requests.last.page, 1);
    repo.requests.last.result.complete(const ProductPage(total: 0));
    await flush();
    expect(container.read(provider).isEmpty, isTrue);
  });
}
