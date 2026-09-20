// MAINTENANCE ONLY: list leftover *_verify databases; --execute drops them.
import 'dotenv/config';
import pg from 'pg';

const source = process.env.DATABASE_URL;
if (!source) throw new Error('DATABASE_URL is required');
const adminUrl = new URL(source);
if (!['postgres:', 'postgresql:'].includes(adminUrl.protocol)) {
  throw new Error('DATABASE_URL must be a PostgreSQL URL');
}
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('schema');
const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const { rows } = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname');
  const leftovers = rows.map(({ datname }) => datname).filter((name) => /^[a-z][a-z0-9_]*_verify$/.test(name));
  if (!leftovers.length) console.log('No *_verify databases found.');
  for (const name of leftovers) {
    if (process.argv.includes('--execute')) {
      await client.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      console.log(`Dropped ${name}`);
    } else {
      console.log(`Would drop ${name}; rerun with --execute to confirm.`);
    }
  }
} finally {
  await client.end();
}
