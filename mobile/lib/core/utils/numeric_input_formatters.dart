import 'package:flutter/services.dart';

import 'numeric_text.dart';

/// Opt in on numeric fields. This never inserts grouping or filters
/// other characters; existing validators still own each field's syntax.
class WesternDigitsInputFormatter extends TextInputFormatter {
  const WesternDigitsInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (!newValue.composing.isCollapsed) return newValue;
    // Both supported digit sets have the same UTF-16 length as ASCII digits.
    return newValue.copyWith(text: normalizeDigits(newValue.text));
  }
}

/// Phone syntax only: Western digits and at most one leading `+`. Formatting
/// characters are removed without adding a country code or validating length.
class PhoneInputFormatter extends TextInputFormatter {
  const PhoneInputFormatter();

  static final _characters = FilteringTextInputFormatter.allow(
    RegExp(r'[0-9+]'),
  );
  static final _extraPluses = FilteringTextInputFormatter.deny(
    RegExp(r'(?!^)\+'),
  );

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (!newValue.composing.isCollapsed) return newValue;
    final normalized = newValue.copyWith(text: normalizeDigits(newValue.text));
    // Flutter maps both selection endpoints as characters are removed. Strip
    // formatting first so a pasted " +964 ..." can retain its leading plus.
    final filtered = _characters.formatEditUpdate(oldValue, normalized);
    return _extraPluses.formatEditUpdate(oldValue, filtered);
  }
}

/// OTP syntax only. Length remains the existing validator's responsibility.
class OtpInputFormatter extends TextInputFormatter {
  const OtpInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (!newValue.composing.isCollapsed) return newValue;
    return FilteringTextInputFormatter.digitsOnly.formatEditUpdate(
      oldValue,
      newValue.copyWith(text: normalizeDigits(newValue.text)),
    );
  }
}

/// Explicit money-only formatter. Maps both selection endpoints by their raw
/// character positions, retaining which side of an existing comma they occupy.
/// Active IME composition is left intact until commit, as Flutter requires.
class MoneyInputFormatter extends TextInputFormatter {
  const MoneyInputFormatter();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (!newValue.composing.isCollapsed) return newValue;
    var raw = MoneyText.normalize(newValue.text);
    if (!MoneyText.isEditable(raw)) return oldValue;

    int rawOffset(int offset) => offset < 0
        ? -1
        : MoneyText.normalize(
            newValue.text.substring(0, offset.clamp(0, newValue.text.length)),
          ).length;
    var base = rawOffset(newValue.selection.baseOffset);
    var extent = rawOffset(newValue.selection.extentOffset);

    // Backspace/Delete on an automatically inserted comma removes the adjacent
    // digit in that direction. Reinserting the comma alone would trap the caret.
    if (oldValue.selection.isValid &&
        oldValue.selection.isCollapsed &&
        newValue.selection.isValid &&
        newValue.selection.isCollapsed &&
        oldValue.text.length == newValue.text.length + 1) {
      final removed = newValue.selection.extentOffset;
      final backspace = oldValue.selection.extentOffset == removed + 1;
      final delete = oldValue.selection.extentOffset == removed;
      if ((backspace || delete) &&
          removed < oldValue.text.length &&
          oldValue.text[removed] == ',' &&
          oldValue.text.replaceRange(removed, removed + 1, '') ==
              newValue.text) {
        final digit = backspace ? extent - 1 : extent;
        if (digit >= 0 &&
            digit < raw.length &&
            RegExp(r'[0-9]').hasMatch(raw[digit])) {
          raw = raw.replaceRange(digit, digit + 1, '');
          base = extent = digit;
        }
      }
    }

    final formatted = MoneyText.format(raw);
    int formattedOffset(int offset, int originalOffset) {
      if (offset < 0) return -1;
      var seen = 0;
      var index = 0;
      while (index < formatted.length && seen < offset) {
        if (formatted[index] != ',') seen++;
        index++;
      }
      final wasAfterComma =
          originalOffset > 0 &&
          originalOffset <= newValue.text.length &&
          (newValue.text[originalOffset - 1] == ',' ||
              newValue.text[originalOffset - 1] == '٬');
      if (wasAfterComma &&
          index < formatted.length &&
          formatted[index] == ',') {
        index++;
      }
      return index;
    }

    return TextEditingValue(
      text: formatted,
      selection: newValue.selection.copyWith(
        baseOffset: formattedOffset(base, newValue.selection.baseOffset),
        extentOffset: formattedOffset(extent, newValue.selection.extentOffset),
      ),
    );
  }
}
