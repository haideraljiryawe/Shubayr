import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fetchWebAdminSource } from './web_admin_source.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'shubayr-admin-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, 'remote');
  const local = join(root, 'local');
  mkdirSync(remote);
  const git = (cwd, ...args) => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git(remote, 'init', '-b', 'main');
  mkdirSync(join(remote, 'api'));
  function publish(version) {
    writeFileSync(join(remote, 'api/openapi.yaml'), `openapi: 3.1.0\ninfo:\n  title: Test\n  version: ${version}\npaths: {}\n`);
    git(remote, 'add', '.');
    git(remote, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '-m', 'Update test contract');
    return git(remote, 'rev-parse', 'HEAD');
  }
  publish('17.4.0');
  git(root, 'clone', remote, local);
  git(local, 'switch', '-c', 'mobile');
  return { root, remote, local, git, publish };
}

test('fetch follows new main and preserves local branch, HEAD and uncommitted files', (t) => {
  const { local, git, publish } = fixture(t);
  const head = git(local, 'rev-parse', 'HEAD');
  writeFileSync(join(local, 'personal.txt'), 'Keep this local work');
  const status = git(local, 'status', '--porcelain');
  assert.equal(fetchWebAdminSource(local).apiContract, '17.4.0');
  const latest = publish('17.5.0');
  assert.deepEqual(fetchWebAdminSource(local), {
    revision: latest, apiContract: '17.5.0', source: 'Shubayr origin/main',
  });
  assert.equal(git(local, 'rev-parse', 'HEAD'), head);
  assert.equal(git(local, 'branch', '--show-current'), 'mobile');
  assert.equal(git(local, 'status', '--porcelain'), status);
});

test('fetch failure refuses stale remote-tracking main', (t) => {
  const { local, root, git } = fixture(t);
  fetchWebAdminSource(local);
  git(local, 'remote', 'set-url', 'origin', join(root, 'missing-remote'));
  assert.throws(() => fetchWebAdminSource(local), /Cannot fetch origin\/main/);
});

test('missing contract version blocks preparation', (t) => {
  const { local, publish } = fixture(t);
  publish('unknown');
  assert.throws(() => fetchWebAdminSource(local), /Cannot identify info.version/);
});
