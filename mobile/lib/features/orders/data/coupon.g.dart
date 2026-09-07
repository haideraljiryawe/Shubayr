// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'coupon.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Coupon _$CouponFromJson(Map<String, dynamic> json) => Coupon(
  code: json['code'] as String,
  type: json['type'] as String? ?? 'fixed',
  value: json['value'] as num? ?? 0,
);

Map<String, dynamic> _$CouponToJson(Coupon instance) => <String, dynamic>{
  'code': instance.code,
  'type': instance.type,
  'value': instance.value,
};
