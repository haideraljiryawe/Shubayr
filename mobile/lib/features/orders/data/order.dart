import '../../cart/data/cart.dart';
import 'package:json_annotation/json_annotation.dart';
import '../../../core/error/failure.dart';
import 'order_tracking.dart';

part 'order.g.dart';

const remoteOrderStatuses = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_dispatch',
  'dispatched',
  'delivered',
  'failed',
  'rejected',
  'cancelled',
  'return_requested',
  'returned',
];

@JsonSerializable(explicitToJson: true)
class Order {
  const Order({
    required this.id,
    this.orderNumber = '',
    this.version,
    this.status = 'pending',
    this.paymentMethod = 'cod',
    this.addressId,
    this.subtotal = 0,
    this.deliveryFee = 0,
    this.discount = 0,
    this.total = 0,
    this.currency,
    this.placedAt,
    this.items = const [],
    this.cancellationRequest,
    this.attentionDetails,
    this.timeline,
    this.priceChangeInfo,
    this.collection,
    this.originalDeliveryFee,
    this.adjustedDeliveryFee,
    this.couponDiscount,
    this.tierDiscount,
    this.loyaltyRedemptionAmount,
    this.loyaltyPointsRedeemed,
    this.discountSource,
    this.appliedTier,
    this.nextTier,
    this.deliveryGovernorate,
    this.returns = const [],
  });

  final String id;
  @JsonKey(name: 'order_number')
  final String orderNumber;
  final String status;

  /// Absent versions cannot authorize a state-changing request.
  @JsonKey(includeIfNull: false)
  final int? version;
  @JsonKey(name: 'payment_method')
  final String paymentMethod;
  @JsonKey(name: 'address_id')
  final String? addressId;
  final num subtotal;
  @JsonKey(name: 'delivery_fee')
  final num deliveryFee;
  final num discount;
  @JsonKey(name: 'original_delivery_fee')
  final num? originalDeliveryFee;
  @JsonKey(name: 'adjusted_delivery_fee')
  final num? adjustedDeliveryFee;
  @JsonKey(name: 'coupon_discount')
  final num? couponDiscount;
  @JsonKey(name: 'tier_discount')
  final num? tierDiscount;
  @JsonKey(name: 'loyalty_redemption_amount')
  final num? loyaltyRedemptionAmount;
  @JsonKey(name: 'loyalty_points_redeemed')
  final int? loyaltyPointsRedeemed;
  @JsonKey(name: 'discount_source')
  final String? discountSource;
  @JsonKey(name: 'applied_tier')
  final DiscountTier? appliedTier;
  @JsonKey(name: 'next_tier')
  final DiscountTier? nextTier;
  @JsonKey(name: 'delivery_governorate')
  final OrderGovernorate? deliveryGovernorate;
  final List<OrderReturnSummary> returns;
  final num total;
  @JsonKey(includeIfNull: false)
  final String? currency;
  @JsonKey(name: 'placed_at')
  final DateTime? placedAt;
  final List<OrderItem> items;
  @JsonKey(name: 'cancellation_request', includeIfNull: false)
  final OrderCancellationRequest? cancellationRequest;
  @JsonKey(name: 'attention_details', includeIfNull: false)
  final OrderAttentionDetails? attentionDetails;
  @JsonKey(includeIfNull: false)
  final List<OrderEvent>? timeline;
  @JsonKey(name: 'price_change_info', includeIfNull: false)
  final OrderPriceChangeInfo? priceChangeInfo;
  @JsonKey(includeIfNull: false)
  final OrderCollectionResult? collection;

  factory Order.fromJson(Map<String, dynamic> json) {
    if (json.containsKey('version') &&
        (json['version'] is! int || (json['version'] as int) < 1)) {
      throw const AppFailure(FailureKind.server);
    }
    return _$OrderFromJson(json);
  }

  Map<String, dynamic> toJson() => _$OrderToJson(this);
}

@JsonSerializable()
class OrderItem {
  const OrderItem({
    required this.id,
    required this.productId,
    this.variantId,
    this.productNameAr,
    this.productNameEn,
    this.imageUrl,
    bool? imageSnapshotProvided,
    this.quantity = 1,
    this.baseUnit,
    this.wholeUnitsOnly,
    this.unitPrice = 0,
    this.lineTotal = 0,
    this.reviewed,
    this.currency,
    this.discountShare,
    this.couponDiscountShare,
    this.tierDiscountShare,
    this.loyaltyDiscountShare,
    this.otherAdjustmentShare,
    this.netLineTotal,
    this.netPaidTotal,
  }) : imageSnapshotProvided = imageSnapshotProvided ?? (imageUrl != null);

  final String id;
  @JsonKey(name: 'product_id')
  final String productId;
  @JsonKey(name: 'variant_id')
  final String? variantId;
  @JsonKey(name: 'product_name_ar', includeIfNull: false)
  final String? productNameAr;
  @JsonKey(name: 'product_name_en', includeIfNull: false)
  final String? productNameEn;
  @JsonKey(name: 'image_url')
  final String? imageUrl;

  /// Missing (legacy) and explicit null (no image at purchase) differ.
  /// Local decoding metadata only; never an API field.
  @JsonKey(includeFromJson: false, includeToJson: false)
  final bool imageSnapshotProvided;

  bool get needsCatalogLabel => snapshotName('en') == null || variantId != null;
  bool get needsCatalogDetails => needsCatalogLabel || !imageSnapshotProvided;

  String? snapshotName(String language) {
    final names = language == 'ar'
        ? [productNameAr, productNameEn]
        : [productNameEn, productNameAr];
    for (final name in names) {
      if (name != null && name.trim().isNotEmpty) return name.trim();
    }
    return null;
  }

  final num quantity;
  @JsonKey(name: 'base_unit', includeIfNull: false)
  final String? baseUnit;
  @JsonKey(name: 'whole_units_only', includeIfNull: false)
  final bool? wholeUnitsOnly;
  @JsonKey(name: 'unit_price')
  final num unitPrice;
  @JsonKey(name: 'line_total')
  final num lineTotal;
  @JsonKey(name: 'discount_share')
  final num? discountShare;
  @JsonKey(name: 'coupon_discount_share')
  final num? couponDiscountShare;
  @JsonKey(name: 'tier_discount_share')
  final num? tierDiscountShare;
  @JsonKey(name: 'loyalty_discount_share')
  final num? loyaltyDiscountShare;
  @JsonKey(name: 'other_adjustment_share')
  final num? otherAdjustmentShare;
  @JsonKey(name: 'net_line_total')
  final num? netLineTotal;
  @JsonKey(name: 'net_paid_total')
  final num? netPaidTotal;

  /// Null means the optional contract field was absent, not proof of no review.
  @JsonKey(includeIfNull: false)
  final bool? reviewed;
  @JsonKey(includeIfNull: false)
  final String? currency;

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    final item = _$OrderItemFromJson(json);
    return OrderItem(
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      baseUnit: item.baseUnit,
      wholeUnitsOnly: item.wholeUnitsOnly,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      discountShare: item.discountShare,
      couponDiscountShare: item.couponDiscountShare,
      tierDiscountShare: item.tierDiscountShare,
      loyaltyDiscountShare: item.loyaltyDiscountShare,
      otherAdjustmentShare: item.otherAdjustmentShare,
      netLineTotal: item.netLineTotal,
      netPaidTotal: item.netPaidTotal,
      reviewed: item.reviewed,
      currency: item.currency,
      productNameAr: item.productNameAr,
      productNameEn: item.productNameEn,
      imageUrl: item.imageUrl,
      imageSnapshotProvided: json.containsKey('image_url'),
    );
  }

  Map<String, dynamic> toJson() {
    final json = _$OrderItemToJson(this);
    if (!imageSnapshotProvided) json.remove('image_url');
    return json;
  }
}

/// One page of orders. Matches `OrderPage` in `api/openapi.yaml`.
@JsonSerializable(explicitToJson: true)
class OrderPage {
  const OrderPage({
    this.page = 1,
    this.perPage = 20,
    this.total = 0,
    this.data = const [],
  });

  final int page;
  @JsonKey(name: 'per_page')
  final int perPage;
  final int total;
  final List<Order> data;

  factory OrderPage.fromJson(Map<String, dynamic> json) =>
      _$OrderPageFromJson(json);

  Map<String, dynamic> toJson() => _$OrderPageToJson(this);
}

@JsonSerializable()
class OrderCancellationRequest {
  const OrderCancellationRequest({
    required this.status,
    this.reason,
    this.requestedAt,
    this.resolvedAt,
    this.resolutionNote,
  });
  final String status;
  final String? reason;
  @JsonKey(name: 'requested_at', includeIfNull: false)
  final DateTime? requestedAt;
  @JsonKey(name: 'resolved_at', includeIfNull: false)
  final DateTime? resolvedAt;
  @JsonKey(name: 'resolution_note', includeIfNull: false)
  final String? resolutionNote;
  factory OrderCancellationRequest.fromJson(Map<String, dynamic> json) =>
      _$OrderCancellationRequestFromJson(json);
  Map<String, dynamic> toJson() => _$OrderCancellationRequestToJson(this);
}

@JsonSerializable(explicitToJson: true)
class OrderAttentionDetails {
  const OrderAttentionDetails({
    this.reductionProposal,
    this.shortLines = const [],
  });
  @JsonKey(name: 'short_lines')
  final List<OrderShortLine> shortLines;
  @JsonKey(name: 'reduction_proposal', includeIfNull: false)
  final OrderQuantityProposal? reductionProposal;
  factory OrderAttentionDetails.fromJson(Map<String, dynamic> json) =>
      _$OrderAttentionDetailsFromJson(json);
  Map<String, dynamic> toJson() => _$OrderAttentionDetailsToJson(this);
}

@JsonSerializable()
class OrderQuantityProposal {
  const OrderQuantityProposal({
    required this.orderItemId,
    required this.oldQuantity,
    required this.newQuantity,
    required this.reason,
    required this.status,
  });
  @JsonKey(name: 'order_item_id')
  final String orderItemId;
  @JsonKey(name: 'old_quantity')
  final num oldQuantity;
  @JsonKey(name: 'new_quantity')
  final num newQuantity;
  final String reason;
  final String status;
  factory OrderQuantityProposal.fromJson(Map<String, dynamic> json) =>
      _$OrderQuantityProposalFromJson(json);
  Map<String, dynamic> toJson() => _$OrderQuantityProposalToJson(this);
}

@JsonSerializable(explicitToJson: true)
class OrderPriceChangeInfo {
  const OrderPriceChangeInfo({required this.acceptedAt, required this.lines});
  @JsonKey(name: 'accepted_at')
  final DateTime acceptedAt;
  final List<OrderAcceptedPrice> lines;
  factory OrderPriceChangeInfo.fromJson(Map<String, dynamic> json) =>
      _$OrderPriceChangeInfoFromJson(json);
  Map<String, dynamic> toJson() => _$OrderPriceChangeInfoToJson(this);
}

@JsonSerializable()
class OrderAcceptedPrice {
  const OrderAcceptedPrice({
    required this.variantId,
    required this.unitPrice,
    required this.priceVersion,
  });
  @JsonKey(name: 'variant_id')
  final String variantId;
  @JsonKey(name: 'unit_price')
  final num unitPrice;
  @JsonKey(name: 'price_version')
  final String priceVersion;
  factory OrderAcceptedPrice.fromJson(Map<String, dynamic> json) =>
      _$OrderAcceptedPriceFromJson(json);
  Map<String, dynamic> toJson() => _$OrderAcceptedPriceToJson(this);
}

@JsonSerializable()
class OrderShortLine {
  const OrderShortLine({
    required this.orderItemId,
    required this.variantId,
    required this.requested,
    required this.allocated,
    required this.short,
  });
  @JsonKey(name: 'order_item_id')
  final String orderItemId;
  @JsonKey(name: 'variant_id')
  final String variantId;
  @JsonKey(fromJson: _quantityFromString, toJson: _quantityToString)
  final num requested;
  @JsonKey(fromJson: _quantityFromString, toJson: _quantityToString)
  final num allocated;
  @JsonKey(fromJson: _quantityFromString, toJson: _quantityToString)
  final num short;
  factory OrderShortLine.fromJson(Map<String, dynamic> json) =>
      _$OrderShortLineFromJson(json);
  Map<String, dynamic> toJson() => _$OrderShortLineToJson(this);
}

num _quantityFromString(String value) {
  final quantity = num.parse(value);
  if (!quantity.isFinite || quantity < 0) {
    throw const FormatException('Invalid quantity');
  }
  return quantity;
}

String _quantityToString(num value) => value.toString();

@JsonSerializable()
class OrderCollectionResult {
  const OrderCollectionResult({
    required this.result,
    required this.amountCollected,
    required this.shortfall,
    required this.confirmationState,
    required this.currency,
  });
  final String result;
  @JsonKey(name: 'amount_collected')
  final num? amountCollected;
  final num? shortfall;
  @JsonKey(name: 'confirmation_state')
  final String confirmationState;
  final String currency;
  factory OrderCollectionResult.fromJson(Map<String, dynamic> json) =>
      _$OrderCollectionResultFromJson(json);
  Map<String, dynamic> toJson() => _$OrderCollectionResultToJson(this);
}

@JsonSerializable(fieldRename: FieldRename.snake)
class OrderReturnSummary {
  const OrderReturnSummary({
    required this.id,
    required this.documentNumber,
    required this.status,
    required this.refundAmount,
  });
  final String id, documentNumber, status;
  final num refundAmount;
  factory OrderReturnSummary.fromJson(Map<String, dynamic> json) =>
      _$OrderReturnSummaryFromJson(json);
  Map<String, dynamic> toJson() => _$OrderReturnSummaryToJson(this);
}

@JsonSerializable(fieldRename: FieldRename.snake)
class OrderGovernorate {
  const OrderGovernorate({required this.code, this.nameAr, this.nameEn});
  final String code;
  final String? nameAr, nameEn;
  factory OrderGovernorate.fromJson(Map<String, dynamic> json) =>
      _$OrderGovernorateFromJson(json);
  Map<String, dynamic> toJson() => _$OrderGovernorateToJson(this);
}
