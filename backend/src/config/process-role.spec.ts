import { validateEnvironment } from './env.validation';
import {
  processRole,
  runsBackgroundJobs,
  runsHttpServer,
} from './process-role';

describe('process roles', () => {
  it('defaults to the combined local/test role', () => {
    expect(processRole(undefined)).toBe('all');
    expect(runsBackgroundJobs(undefined)).toBe(true);
    expect(runsHttpServer(undefined)).toBe(true);
  });

  it('separates HTTP and background execution', () => {
    expect(runsHttpServer('api')).toBe(true);
    expect(runsBackgroundJobs('api')).toBe(false);
    expect(runsHttpServer('worker')).toBe(false);
    expect(runsBackgroundJobs('worker')).toBe(true);
  });

  it('rejects unknown configured roles', () => {
    expect(() =>
      validateEnvironment({
        PROCESS_ROLE: 'both-sometimes',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
        REDIS_URL: 'redis://localhost:6379',
        MEILI_HOST: 'http://localhost:7700',
        MEILI_MASTER_KEY: 'test-master-key',
        JWT_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'b'.repeat(32),
        S3_ENDPOINT: 'http://localhost:8333',
        S3_ACCESS_KEY: 'test',
        S3_SECRET_KEY: 'test-secret',
      }),
    ).toThrow(/PROCESS_ROLE/);
  });
});
