import 'dart:typed_data';

/// Display sources are deliberately separate from the URL-only API payload.
sealed class CatalogImage {
  const CatalogImage();
}

final class UrlCatalogImage extends CatalogImage {
  const UrlCatalogImage(this.url);
  final String url;
}

/// Bytes live only with the mock record/draft in this process. Never serialized.
final class LocalCatalogImage extends CatalogImage {
  LocalCatalogImage(Uint8List bytes, {required this.name})
    : bytes = Uint8List.fromList(bytes).asUnmodifiableView();
  final Uint8List bytes;
  final String name;
}
