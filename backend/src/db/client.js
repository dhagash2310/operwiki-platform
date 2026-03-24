import pg from 'pg';
const { Pool } = pg;
export const db = new Pool({ connectionString: process.env.DATABASE_URL });
export async function connectDb() {
  const client = await db.connect();
  console.log('PostgreSQL connected');
  client.release();
}
