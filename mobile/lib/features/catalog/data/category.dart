import 'package:json_annotation/json_annotation.dart';

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
