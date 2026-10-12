import 'package:json_annotation/json_annotation.dart';

/// Customer-facing label computed by the server; quantities remain internal.
enum StockAvailability {
  @JsonValue('out_of_stock')
  outOfStock,
  @JsonValue('low_stock')
  lowStock,
  @JsonValue('in_stock')
  inStock,
}
