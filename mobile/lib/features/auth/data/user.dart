import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

/// `User` as defined in `api/openapi.yaml`.
///
/// [role] selects which application *area* the user enters (see [UserRole]);
/// [permissions] are the flattened RBAC keys the contract now exposes, used for
/// fine-grained gating *within* an area (e.g. hiding actions a manager lacks).
@JsonSerializable(fieldRename: FieldRename.snake)
class User {
  const User({
    this.id,
    this.name,
    this.phone,
    this.role,
    this.permissions = const [],
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);

  final String? id;
  final String? name;
  final String? phone;

  /// Raw role string from the API, e.g. `customer`, `delivery`, `admin`.
  final String? role;

  /// Flattened permission keys granted to the user's role, e.g.
  /// `orders.confirm`. Empty for customers and guests.
  @JsonKey(defaultValue: <String>[])
  final List<String> permissions;

  Map<String, dynamic> toJson() => _$UserToJson(this);
}
