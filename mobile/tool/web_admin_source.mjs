import { execFileSync } from 'node:child_process';

// Resolve fresh remote main without switching or modifying the checkout.
export function fetchMainSource(repository) {
  const git = (args) => execFileSync('git', args, {
    cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  }).trim();
  try {
    git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
  } catch {
    throw new Error('Cannot fetch origin/main. Check repository access and retry; a cached web application will not be used as the latest version.');
  }
  const revision = git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']);
  const contract = git(['show', `${revision}:api/openapi.yaml`]);
  const info = contract.split(/^info:\s*$/m)[1]?.split(/^\S/m)[0];
  const apiContract = info?.match(/^  version:\s*['"]?(\d+\.\d+\.\d+(?:-[\w.-]+)?)['"]?\s*$/m)?.[1];
  if (!apiContract) throw new Error('Cannot identify info.version in the fetched API contract.');
  return { revision, apiContract, source: 'Shubayr origin/main' };
}

// Retain the existing Admin launcher entry point; both apps resolve the same main.
export const fetchWebAdminSource = fetchMainSource;
