import '../../../core/error/failure.dart';
import '../../../core/utils/numeric_text.dart';

/// The agent's explicit choice, independent of the request's operation id.
class DeliveryCollectionInput {
  const DeliveryCollectionInput.unconfirmed() : amount = null;
  DeliveryCollectionInput.confirmed(String value)
    : amount = MoneyText.normalize(value);
  final String? amount;
  String get confirmation => amount == null ? 'unconfirmed' : 'confirmed';

  void validate(num amountDue) {
    if (amount == null) return;
    final parsed = num.tryParse(amount!);
    if (!RegExp(r'^\d+(\.\d{1,6})?$').hasMatch(amount!) ||
        parsed == null ||
        !parsed.isFinite ||
        parsed < 0 ||
        parsed > amountDue) {
      throw const AppFailure(
        FailureKind.validation,
        code: 'INVALID_COLLECTION_AMOUNT',
      );
    }
  }
}
