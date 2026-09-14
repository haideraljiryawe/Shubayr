import '../../../core/error/failure.dart';
import '../../orders/data/order.dart';

const adminOrderStatuses = [
  'pending',
  'confirmed',
  'processing',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'cancelled',
  'return_requested',
  'returned',
];

/// Query fields supported by GET /admin/orders. Dates are inclusive calendar
/// dates; no client-side filtering of an already paginated result is performed.
class AdminOrderQuery {
  const AdminOrderQuery({this.status, this.search = '', this.from, this.to});
  final String? status;
  final String search;
  final DateTime? from, to;
  static String date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  Map<String, dynamic> parameters({required int page, required int perPage}) =>
      {
        if (status != null) 'status': status,
        if (search.trim().isNotEmpty) 'q': search.trim(),
        if (from != null) 'from': date(from!),
        if (to != null) 'to': date(to!),
        'page': page,
        'per_page': perPage,
      };
  void validate() {
    if ((status != null && !adminOrderStatuses.contains(status)) ||
        (from != null && to != null && date(from!).compareTo(date(to!)) > 0)) {
      throw const AppFailure(FailureKind.validation);
    }
  }

  @override
  bool operator ==(Object other) =>
      other is AdminOrderQuery &&
      status == other.status &&
      search == other.search &&
      from == other.from &&
      to == other.to;
  @override
  int get hashCode => Object.hash(status, search, from, to);
}

abstract interface class AdminOrderRepository {
  Future<OrderPage> fetchOrders({
    AdminOrderQuery query = const AdminOrderQuery(),
    int page = 1,
    int perPage = 20,
  });
  Future<Order> updateStatus(String id, String status);
}
