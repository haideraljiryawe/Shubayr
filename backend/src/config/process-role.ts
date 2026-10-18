export const PROCESS_ROLES = ['api', 'worker', 'all'] as const;

export type ProcessRole = (typeof PROCESS_ROLES)[number];

export function processRole(value = process.env.PROCESS_ROLE): ProcessRole {
  return value === 'api' || value === 'worker' || value === 'all'
    ? value
    : 'all';
}

export function runsBackgroundJobs(value = process.env.PROCESS_ROLE): boolean {
  return processRole(value) !== 'api';
}

export function runsHttpServer(value = process.env.PROCESS_ROLE): boolean {
  return processRole(value) !== 'worker';
}
