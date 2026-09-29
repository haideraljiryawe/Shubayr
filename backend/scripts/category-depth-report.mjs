import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(`
    WITH RECURSIVE category_paths AS (
      SELECT id, parent_id, name_en, slug, 0 AS depth,
             ARRAY[id] AS path, false AS cycle
      FROM categories
      WHERE parent_id IS NULL
      UNION ALL
      SELECT child.id, child.parent_id, child.name_en, child.slug,
             parent.depth + 1,
             parent.path || child.id,
             child.id = ANY(parent.path)
      FROM categories child
      JOIN category_paths parent ON parent.id = child.parent_id
      WHERE NOT parent.cycle
    )
    SELECT id, parent_id, name_en, slug, depth, path, cycle
    FROM category_paths
    WHERE depth > 1 OR cycle
    ORDER BY depth DESC, id
  `);
  console.log(
    JSON.stringify(
      {
        ok: result.rowCount === 0,
        rule: 'categories may contain roots and direct children only',
        violating_count: result.rowCount,
        categories: result.rows,
      },
      null,
      2,
    ),
  );
  process.exitCode = result.rowCount === 0 ? 0 : 1;
} finally {
  await client.end();
}
