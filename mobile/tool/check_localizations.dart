import 'dart:io';

/// Run from mobile/: dart run tool/check_localizations.dart
/// Leaves regenerated output available for review if it finds stale files.
void main() {
  if (!File('l10n.yaml').existsSync()) {
    stderr.writeln('Run this command from the mobile directory.');
    exitCode = 1;
    return;
  }
  final before = snapshot();
  if (before.isEmpty) {
    stderr.writeln('Missing committed localization output.');
    exitCode = 1;
    return;
  }
  if (!generate()) return;
  final first = snapshot();
  if (!generate()) return;
  final second = snapshot();
  if (!same(first, second)) {
    stderr.writeln('Localization generation is not repeatable.');
    exitCode = 1;
  } else if (!same(before, first)) {
    stderr.writeln(
      'Localization output was stale. Review and commit the regenerated files, '
      'then run this check again.',
    );
    exitCode = 1;
  } else {
    stdout.writeln('Localization output is unchanged after two generations.');
  }
}

Map<String, String> snapshot() {
  final directory = Directory('lib/core/l10n/generated');
  if (!directory.existsSync()) return {};
  return {
    for (final file in directory.listSync().whereType<File>())
      if (file.path.endsWith('.dart')) file.path: file.readAsStringSync(),
  };
}

bool same(Map<String, String> a, Map<String, String> b) =>
    a.length == b.length &&
    a.entries.every((entry) => b[entry.key] == entry.value);

bool generate() {
  final result = Process.runSync(
    Platform.isWindows ? 'flutter.bat' : 'flutter',
    ['gen-l10n'],
    runInShell: Platform.isWindows,
  );
  if (result.exitCode == 0) return true;
  stdout.write(result.stdout);
  stderr.write(result.stderr);
  exitCode = result.exitCode;
  return false;
}
