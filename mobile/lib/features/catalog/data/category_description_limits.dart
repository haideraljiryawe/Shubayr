/// Cairo bodySmall (12px), 58% text area minus card padding: about 144px
/// on a 320px phone. Six short words / 36 characters conservatively target two
/// lines in Arabic and English; maxLines remains necessary for wide glyphs and
/// accessibility scaling. Count Unicode code points, including internal spaces.
abstract final class CategoryDescriptionLimits {
  static const maxWords = 6;
  static const maxCharacters = 36;
  static int wordCount(String value) =>
      value.trim().isEmpty ? 0 : value.trim().split(RegExp(r'\s+')).length;
  static bool isValid(String value) =>
      value.trim().isNotEmpty &&
      wordCount(value) <= maxWords &&
      value.trim().runes.length <= maxCharacters;
}
