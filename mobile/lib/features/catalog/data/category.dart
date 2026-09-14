import 'package:json_annotation/json_annotation.dart';

import 'media/catalog_image.dart';

part 'category.g.dart';

/// A department / category node. Shapes match the `Category` schema in
/// `api/openapi.yaml` — names are bilingual and the tree nests via [children].
@JsonSerializable(explicitToJson: true)
class Category {
  const Category({
    required this.id,
    this.parentId,
    required this.nameEn,
    required this.nameAr,
    this.icon,
    this.iconKey,
    this.shortDescriptionEn,
    this.shortDescriptionAr,
    this.image,
    this.imageManaged = false,
    this.sortOrder = 0,
    this.isActive = true,
    this.children = const [],
  });

  final String id;
  @JsonKey(name: 'parent_id')
  final String? parentId;
  @JsonKey(name: 'name_en')
  final String nameEn;
  @JsonKey(name: 'name_ar')
  final String nameAr;
  final String? icon;
  // Product-approved Mock extensions, deliberately excluded from API JSON.
  @JsonKey(includeFromJson: false, includeToJson: false)
  final String? iconKey;
  @JsonKey(includeFromJson: false, includeToJson: false)
  final String? shortDescriptionEn;
  @JsonKey(includeFromJson: false, includeToJson: false)
  final String? shortDescriptionAr;
  @JsonKey(includeFromJson: false, includeToJson: false)
  final CatalogImage? image;
  @JsonKey(includeFromJson: false, includeToJson: false)
  final bool imageManaged;

  String? localizedDescription(String language) => language == 'ar'
      ? (shortDescriptionAr ?? shortDescriptionEn)
      : (shortDescriptionEn ?? shortDescriptionAr);

  factory Category.fromMock(Map<String, dynamic> json) => Category(
    id: json['id'] as String,
    parentId: json['parent_id'] as String?,
    nameEn: json['name_en'] as String,
    nameAr: json['name_ar'] as String,
    icon: json['icon'] as String?,
    iconKey: json['mock_icon_key'] as String?,
    shortDescriptionEn: json['mock_description_en'] as String?,
    shortDescriptionAr: json['mock_description_ar'] as String?,
    image: json['mock_image'] as CatalogImage?,
    imageManaged: json['mock_image_managed'] == true,
    sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
    isActive: json['is_active'] as bool? ?? true,
    children: [
      for (final child in json['children'] as List? ?? [])
        Category.fromMock(Map<String, dynamic>.from(child as Map)),
    ],
  );

  Map<String, dynamic> toMock() => {
    ...toJson(),
    'mock_icon_key': iconKey,
    'mock_description_en': shortDescriptionEn,
    'mock_description_ar': shortDescriptionAr,
    'mock_image': image,
    'mock_image_managed': imageManaged,
    'children': children.map((c) => c.toMock()).toList(),
  };

  @JsonKey(name: 'sort_order')
  final int sortOrder;
  @JsonKey(name: 'is_active')
  final bool isActive;
  final List<Category> children;

  /// The name for the active language, falling back to the other when one side
  /// is missing so a partial payload never shows a blank label.
  String localizedName(String languageCode) {
    if (languageCode == 'ar') return nameAr.isNotEmpty ? nameAr : nameEn;
    return nameEn.isNotEmpty ? nameEn : nameAr;
  }

  factory Category.fromJson(Map<String, dynamic> json) =>
      _$CategoryFromJson(json);

  Map<String, dynamic> toJson() => _$CategoryToJson(this);
}
