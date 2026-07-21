import pg from 'pg';
import { migratePhase2 } from './phase2.js';
import { migratePhase2Documents } from './phase2-documents.js';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';
if (!DATABASE_URL) throw new Error('DATABASE_URL mungon.');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

try {
  await migratePhase2(pool);
  await migratePhase2Documents(pool);
  console.log('Faza 2: migrimi PostgreSQL përfundoi me sukses.');
} finally {
  await pool.end();
}
