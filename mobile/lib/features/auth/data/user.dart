import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

/// `User` exactly as defined in `api/openapi.yaml`.
///
/// Note there is no `permissions` field in the contract yet, so the app gates
/// on [role] only. Permission-level gating waits for the contract.
@JsonSerializable(fieldRename: FieldRename.snake)
class User {
  const User({this.id, this.name, this.phone, this.role});

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);

  final String? id;
  final String? name;
  final String? phone;

  /// Raw role string from the API, e.g. `customer`, `delivery`, `admin`.
  final String? role;

  Map<String, dynamic> toJson() => _$UserToJson(this);
}
