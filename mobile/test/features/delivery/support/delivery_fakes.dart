import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/permissions.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_mock.dart';

const agentSession = Session.signedIn(
  User(
    id: 'agent',
    role: 'delivery',
    permissions: [Permissions.deliveryAssigned],
  ),
);

class DeliveryTestSession extends SessionController {
  DeliveryTestSession({this.initial = agentSession});
  final Session initial;
  @override
  Future<Session> build() async => initial;
  void setSession(Session session) => state = AsyncData(session);
}

typedef DeliveryRequest = ({int page, int perPage});

class RecordingDeliveries extends DeliveryRepositoryMock {
  RecordingDeliveries() : super(agentId: 'agent', delay: Duration.zero);
  final requests = <DeliveryRequest>[];
  final updates = <({String id, String status})>[];
  Future<DeliveryPage> Function(DeliveryRequest)? onFetch;
  Future<Delivery> Function(String, String)? onUpdate;
  @override
  Future<DeliveryPage> fetchAssigned({int page = 1, int perPage = 20}) {
    final request = (page: page, perPage: perPage);
    requests.add(request);
    return onFetch?.call(request) ??
        super.fetchAssigned(page: page, perPage: perPage);
  }

  @override
  Future<Delivery> updateStatus(String id, String status) {
    updates.add((id: id, status: status));
    return onUpdate?.call(id, status) ?? super.updateStatus(id, status);
  }
}

DeliveryPage deliveryPage(DeliveryRequest request, {int total = 45}) =>
    DeliveryPage(
      page: request.page,
      perPage: request.perPage,
      total: total,
      data: [
        for (
          var i = (request.page - 1) * request.perPage;
          i < total && i < request.page * request.perPage;
          i++
        )
          Delivery(
            id: 'd$i',
            orderId: 'order-$i',
            status: 'assigned',
            deliveryFee: 5000,
          ),
      ],
    );
