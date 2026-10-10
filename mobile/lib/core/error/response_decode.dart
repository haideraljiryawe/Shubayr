import '../diagnostics/diagnostics.dart';
import 'failure.dart';

/// Narrow remote-response boundary. StateError, RangeError and other programmer
/// failures deliberately propagate; they are not mislabeled as corrupt JSON.
Future<T> decodeResponse<T>(Future<T> Function() readAndDecode) async {
  try {
    return await readAndDecode();
  } on TypeError catch (error, stack) {
    throw malformedResponse(error, stack);
  } on FormatException catch (error, stack) {
    throw malformedResponse(error, stack);
  } catch (error, stack) {
    if (error is! AppFailure) {
      Diagnostics.report(error, stack, boundary: 'repository.unexpected');
    }
    rethrow;
  }
}

AppFailure malformedResponse(Object error, StackTrace stack) {
  Diagnostics.report(error, stack, boundary: 'response.decode');
  return const AppFailure(FailureKind.server, code: 'MALFORMED_RESPONSE');
}

/// Presentation/action boundary for genuinely unexpected failures. Known
/// failures keep their semantics and structured fields; bugs remain distinct
/// from transport/decoding failures in both diagnostics and user feedback.
AppFailure actionFailure(Object error, StackTrace stack) {
  if (error is AppFailure) return error;
  Diagnostics.report(error, stack, boundary: 'action.unexpected');
  return const AppFailure.unknown();
}
