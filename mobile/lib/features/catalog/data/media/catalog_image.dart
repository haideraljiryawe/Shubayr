import 'dart:typed_data';

/// Display sources are deliberately separate from the URL-only API payload.
sealed class CatalogImage {
  const CatalogImage({this.productImageId});
  final String? productImageId;
}

final class UrlCatalogImage extends CatalogImage {
  const UrlCatalogImage(this.url, {super.productImageId});
  final String url;
}

/// Session-local gallery bytes are never serialized as API JSON.
final class LocalCatalogImage extends CatalogImage {
  LocalCatalogImage(Uint8List bytes, {required this.name, super.productImageId})
    : bytes = Uint8List.fromList(bytes).asUnmodifiableView();
  final Uint8List bytes;
  final String name;
}
