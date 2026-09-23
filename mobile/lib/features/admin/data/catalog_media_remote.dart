import 'package:dio/dio.dart';

import '../../../core/error/failure.dart';
import '../../../core/network/api_client.dart';
import '../../catalog/data/media/catalog_image.dart';
import '../../catalog/data/product.dart';

/// Upload first, then reference durable URLs in the atomic catalog write.
class CatalogMediaRemote {
  const CatalogMediaRemote(this.api);
  final ApiClient api;

  Future<UrlCatalogImage> upload(CatalogImage image) async {
    if (image is UrlCatalogImage) return image;
    final local = image as LocalCatalogImage;
    final name = local.name.toLowerCase();
    final mime = switch (name.split('.').last) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      'avif' => 'image/avif',
      _ => null,
    };
    if (mime == null || local.bytes.length > 8 * 1024 * 1024) {
      throw const AppFailure(FailureKind.validation);
    }
    final result = await api.post<Map<String, dynamic>>(
      '/media/images',
      body: FormData.fromMap({
        'file': MultipartFile.fromBytes(
          local.bytes,
          filename: local.name,
          contentType: DioMediaType.parse(mime),
        ),
      }),
    );
    return UrlCatalogImage(
      result['public_url'] as String,
      productImageId: image.productImageId,
    );
  }

  /// Operations are simulated in request order. Surviving image IDs never
  /// change, including replacements and moves to the primary position.
  static List<Map<String, dynamic>> operations(
    List<ProductImage> original,
    List<UrlCatalogImage> desired,
  ) {
    final remaining = [...original]
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    final result = <Map<String, dynamic>>[];
    final retained = desired.map((image) => image.productImageId).toSet();
    for (final image in [...remaining]) {
      if (!retained.contains(image.id)) {
        result.add({'op': 'remove', 'image_id': image.id});
        remaining.remove(image);
      }
    }
    // Null entries stand for newly added server-assigned image IDs.
    final order = <String?>[for (final image in remaining) image.id];
    for (final (position, image) in desired.indexed) {
      final id = image.productImageId;
      if (id == null) {
        result.add({'op': 'add', 'url': image.url, 'position': position});
        order.insert(position, null);
      } else {
        final current = remaining.where((item) => item.id == id).firstOrNull;
        if (current == null) throw const AppFailure(FailureKind.validation);
        if (current.url != image.url) {
          result.add({'op': 'replace', 'image_id': id, 'url': image.url});
        }
        final from = order.indexOf(id);
        if (from != position) {
          result.add({'op': 'move', 'image_id': id, 'position': position});
          order.insert(position, order.removeAt(from));
        }
      }
    }
    return result;
  }
}
