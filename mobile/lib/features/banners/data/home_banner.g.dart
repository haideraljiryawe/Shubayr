// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'home_banner.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HomeBanner _$HomeBannerFromJson(Map<String, dynamic> json) => HomeBanner(
  id: json['id'] as String,
  title: json['title'] as String? ?? '',
  imageUrl: json['image_url'] as String,
  subtitle: json['subtitle'] as String?,
  ctaText: json['cta_text'] as String?,
  linkUrl: json['link_url'] as String?,
  sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
  isActive: json['is_active'] as bool? ?? true,
  startsAt: json['starts_at'] == null
      ? null
      : DateTime.parse(json['starts_at'] as String),
  endsAt: json['ends_at'] == null
      ? null
      : DateTime.parse(json['ends_at'] as String),
  createdAt: json['created_at'] == null
      ? null
      : DateTime.parse(json['created_at'] as String),
);

Map<String, dynamic> _$HomeBannerToJson(HomeBanner instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'image_url': instance.imageUrl,
      'subtitle': instance.subtitle,
      'cta_text': instance.ctaText,
      'link_url': instance.linkUrl,
      'sort_order': instance.sortOrder,
      'is_active': instance.isActive,
      'starts_at': instance.startsAt?.toIso8601String(),
      'ends_at': instance.endsAt?.toIso8601String(),
      'created_at': instance.createdAt?.toIso8601String(),
    };
