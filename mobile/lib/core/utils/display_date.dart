import 'package:intl/intl.dart';

/// Numeric Gregorian dates with Western digits in both UI languages.
/// Instants use device-local time; calendar-only values keep their date fields.
/// Never use these presentation strings as API query/body values.
abstract final class DisplayDate {
  static String localDate(DateTime instant) => calendarDate(instant.toLocal());

  static String localDateTime(DateTime instant) =>
      DateFormat('yyyy/MM/dd HH:mm', 'en').format(instant.toLocal());

  static String calendarDate(DateTime date) =>
      DateFormat('yyyy/MM/dd', 'en').format(date);
}
