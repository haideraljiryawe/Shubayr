import '../../../../core/l10n/generated/app_localizations.dart';

/// Temporary main-category copy for Mock presentation only, never API data.
/// Unknown IDs have no description. Replace this lookup with contract-backed
/// localized descriptions when available; the card already accepts optional text.
String? mockCategoryDescription(String categoryId, AppLocalizations l10n) =>
    switch (categoryId) {
      'cat-electronics' => l10n.mockCategoryElectronicsDescription,
      'cat-grocery' => l10n.mockCategoryGroceryDescription,
      'cat-clothing' => l10n.mockCategoryClothingDescription,
      'cat-home' => l10n.mockCategoryHomeDescription,
      'cat-beauty' => l10n.mockCategoryBeautyDescription,
      'cat-sports' => l10n.mockCategorySportsDescription,
      _ => null,
    };
