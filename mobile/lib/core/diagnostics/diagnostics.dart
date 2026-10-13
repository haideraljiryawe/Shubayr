import 'dart:developer' as developer;

/// Only sanitized records cross the diagnostics sink. Never retain request data,
/// exception messages (which may embed a payload), or absolute filesystem paths.
class DiagnosticRecord {
  const DiagnosticRecord(this.boundary, this.exception, this.stackTrace);
  final String boundary;
  final Exception exception;
  final StackTrace stackTrace;
}

class RedactedException implements Exception {
  const RedactedException(this.type);
  final String type;
  @override
  String toString() => '$type (message redacted)';
}

/// A replaceable internal sink, with no crash-reporting dependency or user data.
abstract final class Diagnostics {
  static void Function(DiagnosticRecord) sink = _log;

  static void _log(DiagnosticRecord record) => developer.log(
    record.boundary,
    name: 'diagnostics',
    error: record.exception,
    stackTrace: record.stackTrace,
  );

  static void report(
    Object error,
    StackTrace stack, {
    required String boundary,
  }) {
    final frames = <String>[];
    for (final line in stack.toString().split('\n')) {
      // Retain stack locations and symbols, not arbitrary exception text or URLs.
      final frame = RegExp(
        r'^#\d+\s+[\w.$<> =]+\s+\((package:[\w/._-]+\.dart|dart:[\w/._-]+):(\d+:\d+)\)$',
      ).firstMatch(line.trim());
      if (frame != null) frames.add(line.trim());
      if (line.trim() == '<asynchronous suspension>') frames.add(line.trim());
    }
    final safeBoundary = RegExp(r'^[a-zA-Z.]+$').hasMatch(boundary)
        ? boundary
        : 'unexpected';
    final record = DiagnosticRecord(
      safeBoundary,
      RedactedException(error.runtimeType.toString()),
      StackTrace.fromString(
        frames.isEmpty ? '[stack location unavailable]' : frames.join('\n'),
      ),
    );
    try {
      sink(record);
    } catch (_) {
      /* Diagnostics must not break recovery. */
    }
  }
}
