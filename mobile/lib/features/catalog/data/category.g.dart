// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'category.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Category _$CategoryFromJson(Map<String, dynamic> json) => Category(
  id: json['id'] as String,
  parentId: json['parent_id'] as String?,
  nameEn: json['name_en'] as String,
  nameAr: json['name_ar'] as String,
  slug: json['slug'] as String?,
  imageUrl: json['image_url'] as String?,
  iconKey: json['icon_key'] as String?,
  shortDescriptionEn: json['description_en'] as String?,
  shortDescriptionAr: json['description_ar'] as String?,
  sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
  isActive: json['is_visible'] as bool? ?? true,
  children:
      (json['children'] as List<dynamic>?)
          ?.map((e) => Category.fromJson(e as Map<String, dynamic>))
          .toList() ??
      const [],
);

Map<String, dynamic> _$CategoryToJson(Category instance) => <String, dynamic>{
  'id': instance.id,
  'parent_id': instance.parentId,
  'name_en': instance.nameEn,
  'name_ar': instance.nameAr,
  'slug': instance.slug,
  'image_url': instance.imageUrl,
  'icon_key': instance.iconKey,
  'description_en': instance.shortDescriptionEn,
  'description_ar': instance.shortDescriptionAr,
  'sort_order': instance.sortOrder,
  'is_visible': instance.isActive,
  'children': instance.children.map((e) => e.toJson()).toList(),
};
