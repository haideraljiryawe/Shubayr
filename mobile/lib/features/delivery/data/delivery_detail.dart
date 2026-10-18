import 'package:json_annotation/json_annotation.dart';
import '../../../core/utils/quantity.dart';
import 'delivery.dart';

part 'delivery_detail.g.dart';

/// Assignment-scoped order snapshots from GET /deliveries/{id}.
@JsonSerializable(explicitToJson: true, fieldRename: FieldRename.snake)
class DeliveryDetail {
  const DeliveryDetail({
    required this.id,
    required this.orderId,
    required this.orderNumber,
    required this.orderVersion,
    required this.status,
    required this.currency,
    required this.amountDue,
    this.recipientName,
    this.recipientPhone,
    this.shippingAddress,
    required this.items,
  });
  final String id, orderId, orderNumber, status, currency;
  final int orderVersion;
  final num amountDue;
  final String? recipientName, recipientPhone;
  final DeliveryAddress? shippingAddress;
  final List<DeliveryItem> items;
  bool get contactVisible =>
      const ['assigned', 'out_for_delivery', 'failed'].contains(status);
  factory DeliveryDetail.fromJson(Map<String, dynamic> json) {
    final value = _$DeliveryDetailFromJson(json);
    if (value.orderVersion < 1 ||
        !Delivery.statuses.contains(value.status) ||
        !value.amountDue.isFinite ||
        value.amountDue < 0 ||
        value.currency.trim().isEmpty) {
      throw const FormatException('Invalid delivery detail');
    }
    // Never retain contact fields on terminal deliveries, including malformed
    // responses that accidentally contain previously disclosed information.
    if (!value.contactVisible) {
      return DeliveryDetail(
        id: value.id,
        orderId: value.orderId,
        orderNumber: value.orderNumber,
        orderVersion: value.orderVersion,
        status: value.status,
        currency: value.currency,
        amountDue: value.amountDue,
        items: value.items,
      );
    }
    return value;
  }
  Map<String, dynamic> toJson() => _$DeliveryDetailToJson(this);
}

@JsonSerializable(fieldRename: FieldRename.snake)
class DeliveryAddress {
  const DeliveryAddress({
    this.label,
    required this.city,
    this.area,
    this.street,
    this.details,
    this.lat,
    this.lng,
  });
  final String city;
  final String? label, area, street, details;
  final double? lat, lng;
  List<String> get lines => [label, city, area, street, details]
      .whereType<String>()
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();
  bool get hasCoordinates =>
      lat != null &&
      lng != null &&
      lat!.isFinite &&
      lng!.isFinite &&
      lat! >= -90 &&
      lat! <= 90 &&
      lng! >= -180 &&
      lng! <= 180;
  factory DeliveryAddress.fromJson(Map<String, dynamic> json) =>
      _$DeliveryAddressFromJson(json);
  Map<String, dynamic> toJson() => _$DeliveryAddressToJson(this);
}

@JsonSerializable(fieldRename: FieldRename.snake)
class DeliveryItem {
  const DeliveryItem({
    required this.id,
    required this.productNameAr,
    required this.productNameEn,
    required this.variantId,
    required this.variantSku,
    this.variantAttributes,
    required this.quantity,
    required this.baseUnit,
    required this.wholeUnitsOnly,
    required this.unitPrice,
    required this.lineTotal,
    required this.currency,
  });
  final String id,
      productNameAr,
      productNameEn,
      variantId,
      variantSku,
      baseUnit,
      currency;
  final Map<String, dynamic>? variantAttributes;
  final num quantity, unitPrice, lineTotal;
  final bool wholeUnitsOnly;
  factory DeliveryItem.fromJson(Map<String, dynamic> json) {
    final item = _$DeliveryItemFromJson(json);
    if (!isValidQuantity(item.quantity, wholeUnitsOnly: item.wholeUnitsOnly) ||
        !item.unitPrice.isFinite ||
        item.unitPrice < 0 ||
        !item.lineTotal.isFinite ||
        item.lineTotal < 0) {
      throw const FormatException('Invalid delivery item');
    }
    return item;
  }
  Map<String, dynamic> toJson() => _$DeliveryItemToJson(this);
}

@JsonSerializable(fieldRename: FieldRename.snake)
class DeliveryCollection {
  const DeliveryCollection({
    required this.status,
    required this.dueAmount,
    this.collectedAmount,
    this.shortfallAmount,
    required this.currency,
  });
  final String status, currency;
  final num dueAmount;
  final num? collectedAmount, shortfallAmount;
  factory DeliveryCollection.fromJson(Map<String, dynamic> json) =>
      _$DeliveryCollectionFromJson(json);
  Map<String, dynamic> toJson() => _$DeliveryCollectionToJson(this);
}
