import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import YAML from 'yaml';

const backendRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(backendRoot, 'src');
const contractPath = path.resolve(backendRoot, '..', 'api', 'openapi.yaml');
const codePattern = /^[A-Z][A-Z0-9_]+$/;
const codedCalls = new Set([
  'badRequest',
  'conflict',
  'forbidden',
  'invalid',
  'notFound',
  'codedError',
  'assertDifferentActor',
]);

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(item);
    return entry.isFile() && item.endsWith('.ts') && !item.endsWith('.spec.ts')
      ? [item]
      : [];
  });
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function collectStrings(node, target) {
  if (
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    codePattern.test(node.text)
  ) {
    target.add(node.text);
  }
  ts.forEachChild(node, (child) => collectStrings(child, target));
}

function propertyName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node)) return node.text;
  return '';
}

function emittedCodes(file) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const found = new Set();
  const normalized = file.replaceAll('\\', '/');
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name === 'code' || name === 'error_code' || name === 'error') {
        collectStrings(node.initializer, found);
      }
    }
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (codedCalls.has(name)) {
        node.arguments.forEach((argument) => collectStrings(argument, found));
      }
      if (name === 'issue' && normalized.includes('/catalog-import/')) {
        node.arguments.forEach((argument) => collectStrings(argument, found));
      }
    }
    if (ts.isNewExpression(node)) {
      const name = callName(node.expression);
      if (
        name.endsWith('Exception') ||
        name === 'NotificationDeliveryError' ||
        (name === 'Error' && normalized.includes('/cli/push'))
      ) {
        node.arguments?.forEach((argument) => collectStrings(argument, found));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (normalized.endsWith('/common/http/api-error.ts')) {
    collectStrings(source, found);
  }
  return found;
}

const emitted = new Set();
for (const file of filesUnder(sourceRoot)) {
  for (const code of emittedCodes(file)) emitted.add(code);
}

const contract = YAML.parse(fs.readFileSync(contractPath, 'utf8'));
const declared = new Set();
function collectDeclared(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node['x-error-codes'])) {
    node['x-error-codes'].forEach((code) => declared.add(code));
  }
  Object.values(node).forEach(collectDeclared);
}
collectDeclared(contract);
const missing = [...emitted].filter((code) => !declared.has(code)).sort();
if (process.argv.includes('--print')) {
  process.stdout.write(`${[...emitted].sort().join('\n')}\n`);
}
if (missing.length) {
  process.stderr.write(
    `Backend error codes missing from api/openapi.yaml x-error-codes:\n${missing
      .map((code) => `  - ${code}`)
      .join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `OpenAPI declares all ${emitted.size} statically emitted backend error codes.\n`,
  );
}
