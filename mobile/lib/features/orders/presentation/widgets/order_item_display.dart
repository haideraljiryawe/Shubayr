import '../../../catalog/data/product.dart';
import '../../data/order.dart';

/// Historical labels win over the mutable catalog, including the other saved
/// language. IDs remain available when a legacy product can no longer be read.
extension OrderItemDisplay on OrderItem {
  bool get needsCatalogLabel => snapshotName('en') == null || variantId != null;
  bool get needsCatalogDetails => needsCatalogLabel || !imageSnapshotProvided;

  String displayName(String language, Product? product) {
    final saved = snapshotName(language);
    if (saved != null) return saved;
    final current = product?.localizedName(language).trim();
    return current != null && current.isNotEmpty ? current : productId;
  }

  String? displayImage(Product? product) {
    final url = imageSnapshotProvided ? imageUrl : product?.primaryImage;
    return url == null || url.trim().isEmpty ? null : url;
  }

  /// Variant attributes are not snapshotted by this contract. Keep the existing
  /// optional catalog enrichment, with the purchased variant ID as fallback.
  String? variantLabel(Product? product) {
    if (variantId == null) return null;
    final variant = product?.variants
        .where((v) => v.id == variantId)
        .firstOrNull;
    final label = variant == null
        ? null
        : variant.attributes.values.isNotEmpty
        ? variant.attributes.values.join(' · ')
        : variant.sku;
    return label == null || label.trim().isEmpty ? variantId : label;
  }
}
