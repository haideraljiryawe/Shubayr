import 'package:json_annotation/json_annotation.dart';

part 'home_banner.g.dart';

/// Public Banner contract. Copy is supplied as-is, without invented locale fields.
@JsonSerializable()
class HomeBanner {
  const HomeBanner({
    required this.id,
    this.title = '',
    required this.imageUrl,
    this.subtitle,
    this.ctaText,
    this.linkUrl,
    this.sortOrder = 0,
    this.isActive = true,
    this.startsAt,
    this.endsAt,
    this.createdAt,
  });
  final String id, title;
  @JsonKey(name: 'image_url')
  final String imageUrl;
  final String? subtitle;
  @JsonKey(name: 'cta_text')
  final String? ctaText;
  @JsonKey(name: 'link_url')
  final String? linkUrl;
  @JsonKey(name: 'sort_order')
  final int sortOrder;
  @JsonKey(name: 'is_active')
  final bool isActive;
  @JsonKey(name: 'starts_at')
  final DateTime? startsAt;
  @JsonKey(name: 'ends_at')
  final DateTime? endsAt;
  @JsonKey(name: 'created_at')
  final DateTime? createdAt;

  bool activeAt(DateTime now) =>
      isActive &&
      (startsAt == null || !now.isBefore(startsAt!)) &&
      (endsAt == null || !now.isAfter(endsAt!));

  /// Banners open web pages only. Empty/malformed or other URI schemes are inert.
  Uri? get webLink {
    final uri = Uri.tryParse(linkUrl?.trim() ?? '');
    return uri != null &&
            ['http', 'https'].contains(uri.scheme) &&
            uri.host.isNotEmpty
        ? uri
        : null;
  }

  factory HomeBanner.fromJson(Map<String, dynamic> json) =>
      _$HomeBannerFromJson(json);
  Map<String, dynamic> toJson() => _$HomeBannerToJson(this);
}
