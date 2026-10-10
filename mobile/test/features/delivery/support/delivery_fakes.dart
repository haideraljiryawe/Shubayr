import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';
import 'package:shubayr/features/delivery/data/delivery.dart';
import 'package:shubayr/features/delivery/data/delivery_repository_mock.dart';

const agentSession = Session.signedIn(
  User(id: 'agent', role: 'delivery_agent'),
);

class DeliveryTestSession extends SessionController {
  DeliveryTestSession({this.initial = agentSession});
  final Session initial;
  @override
  Future<Session> build() async => initial;
  void setSession(Session session) => state = AsyncData(session);
}

typedef DeliveryRequest = ({String? status, int page, int perPage});

class RecordingDeliveries extends DeliveryRepositoryMock {
  RecordingDeliveries() : super(agentId: 'agent', delay: Duration.zero);
  final requests = <DeliveryRequest>[];
  final versions = <int>[];
  final collections =
      <({String? operationId, String? confirmation, String? amount})>[];
  final reasons = <String?>[];
  final updates = <({String id, String status})>[];
  Future<DeliveryPage> Function(DeliveryRequest)? onFetch;
  Future<Delivery> Function(String, String)? onUpdate;
  @override
  Future<DeliveryPage> fetchAssigned({
    String? status,
    int page = 1,
    int perPage = 20,
  }) {
    final request = (status: status, page: page, perPage: perPage);
    requests.add(request);
    return onFetch?.call(request) ??
        super.fetchAssigned(status: status, page: page, perPage: perPage);
  }

  @override
  Future<Delivery> updateStatus(
    String id,
    String status, {
    required int orderVersion,
    String? reason,
    String? operationId,
    String? collectionConfirmation,
    String? collectedAmount,
  }) {
    versions.add(orderVersion);
    collections.add((
      operationId: operationId,
      confirmation: collectionConfirmation,
      amount: collectedAmount,
    ));
    reasons.add(reason);
    updates.add((id: id, status: status));
    return onUpdate?.call(id, status) ??
        super.updateStatus(
          id,
          status,
          orderVersion: orderVersion,
          reason: reason,
          operationId: operationId,
          collectionConfirmation: collectionConfirmation,
          collectedAmount: collectedAmount,
        );
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
            amountDue: 25000,
            orderVersion: 1,
            id: 'd$i',
            orderId: 'order-$i',
            status: request.status ?? 'assigned',
            deliveryFee: 5000,
          ),
      ],
    );
