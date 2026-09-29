import '../../../core/network/api_client.dart';
import '../../../core/error/failure.dart';
import '../../orders/data/order.dart';

class MonitorQuery {
  const MonitorQuery({this.status, this.search = '', this.from, this.to});
  final String? status;
  final String search;
  final DateTime? from, to;
  static String date(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
  Map<String, dynamic> parameters(int page) {
    if (search.trim().length > 80 ||
        (status != null && !remoteOrderStatuses.contains(status)) ||
        (from != null && to != null && date(from!).compareTo(date(to!)) > 0)) {
      throw const AppFailure(FailureKind.validation);
    }
    return {
      'page': page,
      'per_page': 20,
      if (status != null) 'status': status,
      if (search.trim().isNotEmpty) 'q': search.trim(),
      if (from != null) 'date_from': date(from!),
      if (to != null) 'date_to': date(to!),
    };
  }
}

class MonitorOrder {
  const MonitorOrder({
    required this.order,
    this.customerName,
    required this.customerPhone,
    this.shipping = const {},
  });
  final Order order;
  final String? customerName;
  final String customerPhone;
  final Map<String, dynamic> shipping;
  String get id => order.id;
  factory MonitorOrder.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'] as Map<String, dynamic>?;
    return MonitorOrder(
      order: Order.fromJson(json),
      customerName:
          customer?['name'] as String? ?? json['customer_name'] as String?,
      customerPhone: (customer?['phone'] ?? json['customer_phone']) as String,
      shipping: json['shipping_snapshot'] as Map<String, dynamic>? ?? const {},
    );
  }
}

class MonitorPage {
  const MonitorPage({
    required this.items,
    required this.page,
    required this.total,
    required this.counts,
  });
  final List<MonitorOrder> items;
  final int page, total;
  final Map<String, int> counts;
  bool get hasMore => page * 20 < total;
  factory MonitorPage.fromJson(Map<String, dynamic> json) => MonitorPage(
    items: (json['data'] as List)
        .map((item) => MonitorOrder.fromJson(item as Map<String, dynamic>))
        .toList(),
    page: json['page'] as int,
    total: json['total'] as int,
    counts: (json['status_counts'] as Map<String, dynamic>).map(
      (key, value) => MapEntry(key, value as int),
    ),
  );
}

/// Read-only by construction: app sessions never call administrative endpoints.
class MonitorRepository {
  const MonitorRepository(this.api);
  final ApiClient api;
  Future<MonitorPage> fetch({
    MonitorQuery query = const MonitorQuery(),
    int page = 1,
  }) async {
    final result = MonitorPage.fromJson(
      await api.get<Map<String, dynamic>>(
        '/monitor/orders',
        query: query.parameters(page),
      ),
    );
    if (result.page != page ||
        result.total < 0 ||
        (result.items.isEmpty && (page - 1) * 20 < result.total)) {
      throw const AppFailure(FailureKind.server);
    }
    return result;
  }

  Future<MonitorOrder> detail(String id) async => MonitorOrder.fromJson(
    await api.get<Map<String, dynamic>>(
      '/monitor/orders/${Uri.encodeComponent(id)}',
    ),
  );
}
