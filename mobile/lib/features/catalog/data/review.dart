import 'package:json_annotation/json_annotation.dart';

part 'review.g.dart';

/// A published product review. Shapes match `Review` in `api/openapi.yaml`.
/// The API exposes only `user_id` (no display name), so the UI shows the rating,
/// a verified-purchase mark, the comment and the date — never a reviewer name.
@JsonSerializable()
class Review {
  const Review({
    required this.id,
    required this.productId,
    this.userId,
    this.orderItemId,
    required this.rating,
    this.comment,
    this.verifiedPurchase = false,
    this.status = 'published',
    required this.createdAt,
  });

  final String id;
  @JsonKey(name: 'product_id')
  final String productId;
  @JsonKey(name: 'user_id')
  final String? userId;
  @JsonKey(name: 'order_item_id')
  final String? orderItemId;
  final int rating;
  final String? comment;
  @JsonKey(name: 'verified_purchase')
  final bool verifiedPurchase;
  final String status;
  @JsonKey(name: 'created_at')
  final DateTime createdAt;

  factory Review.fromJson(Map<String, dynamic> json) => _$ReviewFromJson(json);

  Map<String, dynamic> toJson() => _$ReviewToJson(this);
}

/// One page of reviews. Matches `ReviewPage` (the shared `Pagination` envelope
/// plus a `data` array) in `api/openapi.yaml`.
@JsonSerializable(explicitToJson: true)
class ReviewPage {
  const ReviewPage({
    this.page = 1,
    this.perPage = 20,
    this.total = 0,
    this.data = const [],
  });

  final int page;
  @JsonKey(name: 'per_page')
  final int perPage;
  final int total;
  final List<Review> data;

  /// Whether another page exists after this one.
  bool get hasMore => page * perPage < total;

  factory ReviewPage.fromJson(Map<String, dynamic> json) =>
      _$ReviewPageFromJson(json);

  Map<String, dynamic> toJson() => _$ReviewPageToJson(this);
}
