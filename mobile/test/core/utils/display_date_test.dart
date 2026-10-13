import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shubayr/core/utils/display_date.dart';

void main() {
  setUpAll(() => initializeDateFormatting());
  for (final locale in ['ar', 'en']) {
    test('local instants and calendar dates use Western digits ($locale)', () {
      final previous = Intl.defaultLocale;
      Intl.defaultLocale = locale;
      addTearDown(() => Intl.defaultLocale = previous);
      final local = DateTime(2026, 10, 3, 0, 15);
      final instant = local.toUtc();
      expect(DisplayDate.localDate(instant), '2026/10/03');
      expect(DisplayDate.localDateTime(instant), '2026/10/03 00:15');
      expect(DisplayDate.localDateTime(local), '2026/10/03 00:15');
      // Calendar values have no timezone semantics, even with a UTC carrier.
      expect(
        DisplayDate.calendarDate(DateTime.utc(2026, 10, 2, 23, 45)),
        '2026/10/02',
      );
      expect(instant.isUtc, isTrue);
      expect(instant, local.toUtc());
    });
  }
}
