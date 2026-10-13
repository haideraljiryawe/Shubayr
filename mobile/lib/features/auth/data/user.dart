import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

/// The app identity returned by API v6. App permissions are always empty;
/// access comes from the server-assigned role and app surface.
@JsonSerializable(fieldRename: FieldRename.snake)
class User {
  const User({
    this.id,
    this.name,
    this.phone,
    this.email,
    this.role,
    this.surface = 'app',
    this.permissions = const [],
  });

  User copyWith({String? name, String? email, bool clearEmail = false}) => User(
    id: id,
    name: name ?? this.name,
    phone: phone,
    email: clearEmail ? null : email ?? this.email,
    role: role,
    surface: surface,
    permissions: permissions,
  );

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);

  final String? id;
  final String? name;
  final String? phone;
  final String? email;

  /// `customer`, `delivery_agent`, or `order_monitor`.
  final String? role;

  @JsonKey(defaultValue: '')
  final String surface;

  /// Retained for contract decoding; always empty on the app surface.
  @JsonKey(defaultValue: <String>[])
  final List<String> permissions;

  Map<String, dynamic> toJson() => _$UserToJson(this);
}
