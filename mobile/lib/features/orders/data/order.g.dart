// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'order.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Order _$OrderFromJson(Map<String, dynamic> json) => Order(
  id: json['id'] as String,
  orderNumber: json['order_number'] as String? ?? '',
  version: (json['version'] as num?)?.toInt(),
  status: json['status'] as String? ?? 'pending',
  paymentMethod: json['payment_method'] as String? ?? 'cod',
  addressId: json['address_id'] as String?,
  subtotal: json['subtotal'] as num? ?? 0,
  deliveryFee: json['delivery_fee'] as num? ?? 0,
  discount: json['discount'] as num? ?? 0,
  total: json['total'] as num? ?? 0,
  currency: json['currency'] as String?,
  placedAt: json['placed_at'] == null
      ? null
      : DateTime.parse(json['placed_at'] as String),
  items:
      (json['items'] as List<dynamic>?)
          ?.map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
  cancellationRequest: json['cancellation_request'] == null
      ? null
      : OrderCancellationRequest.fromJson(
          json['cancellation_request'] as Map<String, dynamic>,
        ),
  attentionDetails: json['attention_details'] == null
      ? null
      : OrderAttentionDetails.fromJson(
          json['attention_details'] as Map<String, dynamic>,
        ),
  timeline: (json['timeline'] as List<dynamic>?)
      ?.map((e) => OrderEvent.fromJson(e as Map<String, dynamic>))
      .toList(),
  priceChangeInfo: json['price_change_info'] == null
      ? null
      : OrderPriceChangeInfo.fromJson(
          json['price_change_info'] as Map<String, dynamic>,
        ),
  collection: json['collection'] == null
      ? null
      : OrderCollectionResult.fromJson(
          json['collection'] as Map<String, dynamic>,
        ),
  originalDeliveryFee: json['original_delivery_fee'] as num?,
  adjustedDeliveryFee: json['adjusted_delivery_fee'] as num?,
  couponDiscount: json['coupon_discount'] as num?,
  tierDiscount: json['tier_discount'] as num?,
  loyaltyRedemptionAmount: json['loyalty_redemption_amount'] as num?,
  loyaltyPointsRedeemed: (json['loyalty_points_redeemed'] as num?)?.toInt(),
  discountSource: json['discount_source'] as String?,
  appliedTier: json['applied_tier'] == null
      ? null
      : DiscountTier.fromJson(json['applied_tier'] as Map<String, dynamic>),
  nextTier: json['next_tier'] == null
      ? null
      : DiscountTier.fromJson(json['next_tier'] as Map<String, dynamic>),
  deliveryGovernorate: json['delivery_governorate'] == null
      ? null
      : OrderGovernorate.fromJson(
          json['delivery_governorate'] as Map<String, dynamic>,
        ),
  returns:
      (json['returns'] as List<dynamic>?)
          ?.map((e) => OrderReturnSummary.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$OrderToJson(Order instance) => <String, dynamic>{
  'id': instance.id,
  'order_number': instance.orderNumber,
  'status': instance.status,
  'version': ?instance.version,
  'payment_method': instance.paymentMethod,
  'address_id': instance.addressId,
  'subtotal': instance.subtotal,
  'delivery_fee': instance.deliveryFee,
  'discount': instance.discount,
  'original_delivery_fee': instance.originalDeliveryFee,
  'adjusted_delivery_fee': instance.adjustedDeliveryFee,
  'coupon_discount': instance.couponDiscount,
  'tier_discount': instance.tierDiscount,
  'loyalty_redemption_amount': instance.loyaltyRedemptionAmount,
  'loyalty_points_redeemed': instance.loyaltyPointsRedeemed,
  'discount_source': instance.discountSource,
  'applied_tier': instance.appliedTier?.toJson(),
  'next_tier': instance.nextTier?.toJson(),
  'delivery_governorate': instance.deliveryGovernorate?.toJson(),
  'returns': instance.returns.map((e) => e.toJson()).toList(),
  'total': instance.total,
  'currency': ?instance.currency,
  'placed_at': instance.placedAt?.toIso8601String(),
  'items': instance.items.map((e) => e.toJson()).toList(),
  'cancellation_request': ?instance.cancellationRequest?.toJson(),
  'attention_details': ?instance.attentionDetails?.toJson(),
  'timeline': ?instance.timeline?.map((e) => e.toJson()).toList(),
  'price_change_info': ?instance.priceChangeInfo?.toJson(),
  'collection': ?instance.collection?.toJson(),
};

OrderItem _$OrderItemFromJson(Map<String, dynamic> json) => OrderItem(
  id: json['id'] as String,
  productId: json['product_id'] as String,
  variantId: json['variant_id'] as String?,
  productNameAr: json['product_name_ar'] as String?,
  productNameEn: json['product_name_en'] as String?,
  imageUrl: json['image_url'] as String?,
  quantity: json['quantity'] as num? ?? 1,
  baseUnit: json['base_unit'] as String?,
  wholeUnitsOnly: json['whole_units_only'] as bool?,
  unitPrice: json['unit_price'] as num? ?? 0,
  lineTotal: json['line_total'] as num? ?? 0,
  reviewed: json['reviewed'] as bool?,
  currency: json['currency'] as String?,
  discountShare: json['discount_share'] as num?,
  couponDiscountShare: json['coupon_discount_share'] as num?,
  tierDiscountShare: json['tier_discount_share'] as num?,
  loyaltyDiscountShare: json['loyalty_discount_share'] as num?,
  otherAdjustmentShare: json['other_adjustment_share'] as num?,
  netLineTotal: json['net_line_total'] as num?,
  netPaidTotal: json['net_paid_total'] as num?,
);

Map<String, dynamic> _$OrderItemToJson(OrderItem instance) => <String, dynamic>{
  'id': instance.id,
  'product_id': instance.productId,
  'variant_id': instance.variantId,
  'product_name_ar': ?instance.productNameAr,
  'product_name_en': ?instance.productNameEn,
  'image_url': instance.imageUrl,
  'quantity': instance.quantity,
  'base_unit': ?instance.baseUnit,
  'whole_units_only': ?instance.wholeUnitsOnly,
  'unit_price': instance.unitPrice,
  'line_total': instance.lineTotal,
  'discount_share': instance.discountShare,
  'coupon_discount_share': instance.couponDiscountShare,
  'tier_discount_share': instance.tierDiscountShare,
  'loyalty_discount_share': instance.loyaltyDiscountShare,
  'other_adjustment_share': instance.otherAdjustmentShare,
  'net_line_total': instance.netLineTotal,
  'net_paid_total': instance.netPaidTotal,
  'reviewed': ?instance.reviewed,
  'currency': ?instance.currency,
};

OrderPage _$OrderPageFromJson(Map<String, dynamic> json) => OrderPage(
  page: (json['page'] as num?)?.toInt() ?? 1,
  perPage: (json['per_page'] as num?)?.toInt() ?? 20,
  total: (json['total'] as num?)?.toInt() ?? 0,
  data:
      (json['data'] as List<dynamic>?)
          ?.map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$OrderPageToJson(OrderPage instance) => <String, dynamic>{
  'page': instance.page,
  'per_page': instance.perPage,
  'total': instance.total,
  'data': instance.data.map((e) => e.toJson()).toList(),
};

OrderCancellationRequest _$OrderCancellationRequestFromJson(
  Map<String, dynamic> json,
) => OrderCancellationRequest(
  status: json['status'] as String,
  reason: json['reason'] as String?,
  requestedAt: json['requested_at'] == null
      ? null
      : DateTime.parse(json['requested_at'] as String),
  resolvedAt: json['resolved_at'] == null
      ? null
      : DateTime.parse(json['resolved_at'] as String),
  resolutionNote: json['resolution_note'] as String?,
);

Map<String, dynamic> _$OrderCancellationRequestToJson(
  OrderCancellationRequest instance,
) => <String, dynamic>{
  'status': instance.status,
  'reason': instance.reason,
  'requested_at': ?instance.requestedAt?.toIso8601String(),
  'resolved_at': ?instance.resolvedAt?.toIso8601String(),
  'resolution_note': ?instance.resolutionNote,
};

OrderAttentionDetails _$OrderAttentionDetailsFromJson(
  Map<String, dynamic> json,
) => OrderAttentionDetails(
  reductionProposal: json['reduction_proposal'] == null
      ? null
      : OrderQuantityProposal.fromJson(
          json['reduction_proposal'] as Map<String, dynamic>,
        ),
  shortLines:
      (json['short_lines'] as List<dynamic>?)
          ?.map((e) => OrderShortLine.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$OrderAttentionDetailsToJson(
  OrderAttentionDetails instance,
) => <String, dynamic>{
  'short_lines': instance.shortLines.map((e) => e.toJson()).toList(),
  'reduction_proposal': ?instance.reductionProposal?.toJson(),
};

OrderQuantityProposal _$OrderQuantityProposalFromJson(
  Map<String, dynamic> json,
) => OrderQuantityProposal(
  orderItemId: json['order_item_id'] as String,
  oldQuantity: json['old_quantity'] as num,
  newQuantity: json['new_quantity'] as num,
  reason: json['reason'] as String,
  status: json['status'] as String,
);

Map<String, dynamic> _$OrderQuantityProposalToJson(
  OrderQuantityProposal instance,
) => <String, dynamic>{
  'order_item_id': instance.orderItemId,
  'old_quantity': instance.oldQuantity,
  'new_quantity': instance.newQuantity,
  'reason': instance.reason,
  'status': instance.status,
};

OrderPriceChangeInfo _$OrderPriceChangeInfoFromJson(
  Map<String, dynamic> json,
) => OrderPriceChangeInfo(
  acceptedAt: DateTime.parse(json['accepted_at'] as String),
  lines: (json['lines'] as List<dynamic>)
      .map((e) => OrderAcceptedPrice.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$OrderPriceChangeInfoToJson(
  OrderPriceChangeInfo instance,
) => <String, dynamic>{
  'accepted_at': instance.acceptedAt.toIso8601String(),
  'lines': instance.lines.map((e) => e.toJson()).toList(),
};

OrderAcceptedPrice _$OrderAcceptedPriceFromJson(Map<String, dynamic> json) =>
    OrderAcceptedPrice(
      variantId: json['variant_id'] as String,
      unitPrice: json['unit_price'] as num,
      priceVersion: json['price_version'] as String,
    );

Map<String, dynamic> _$OrderAcceptedPriceToJson(OrderAcceptedPrice instance) =>
    <String, dynamic>{
      'variant_id': instance.variantId,
      'unit_price': instance.unitPrice,
      'price_version': instance.priceVersion,
    };

OrderShortLine _$OrderShortLineFromJson(Map<String, dynamic> json) =>
    OrderShortLine(
      orderItemId: json['order_item_id'] as String,
      variantId: json['variant_id'] as String,
      requested: _quantityFromString(json['requested'] as String),
      allocated: _quantityFromString(json['allocated'] as String),
      short: _quantityFromString(json['short'] as String),
    );

Map<String, dynamic> _$OrderShortLineToJson(OrderShortLine instance) =>
    <String, dynamic>{
      'order_item_id': instance.orderItemId,
      'variant_id': instance.variantId,
      'requested': _quantityToString(instance.requested),
      'allocated': _quantityToString(instance.allocated),
      'short': _quantityToString(instance.short),
    };

OrderCollectionResult _$OrderCollectionResultFromJson(
  Map<String, dynamic> json,
) => OrderCollectionResult(
  result: json['result'] as String,
  amountCollected: json['amount_collected'] as num?,
  shortfall: json['shortfall'] as num?,
  confirmationState: json['confirmation_state'] as String,
  currency: json['currency'] as String,
);

Map<String, dynamic> _$OrderCollectionResultToJson(
  OrderCollectionResult instance,
) => <String, dynamic>{
  'result': instance.result,
  'amount_collected': instance.amountCollected,
  'shortfall': instance.shortfall,
  'confirmation_state': instance.confirmationState,
  'currency': instance.currency,
};

OrderReturnSummary _$OrderReturnSummaryFromJson(Map<String, dynamic> json) =>
    OrderReturnSummary(
      id: json['id'] as String,
      documentNumber: json['document_number'] as String,
      status: json['status'] as String,
      refundAmount: json['refund_amount'] as num,
    );

Map<String, dynamic> _$OrderReturnSummaryToJson(OrderReturnSummary instance) =>
    <String, dynamic>{
      'id': instance.id,
      'document_number': instance.documentNumber,
      'status': instance.status,
      'refund_amount': instance.refundAmount,
    };

OrderGovernorate _$OrderGovernorateFromJson(Map<String, dynamic> json) =>
    OrderGovernorate(
      code: json['code'] as String,
      nameAr: json['name_ar'] as String?,
      nameEn: json['name_en'] as String?,
    );

Map<String, dynamic> _$OrderGovernorateToJson(OrderGovernorate instance) =>
    <String, dynamic>{
      'code': instance.code,
      'name_ar': instance.nameAr,
      'name_en': instance.nameEn,
    };
