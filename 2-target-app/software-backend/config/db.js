/**
 * Database Abstraction Layer - Selects MongoDB or in-memory implementation
 */
const useMongo = process.env.USE_MONGODB === 'true';
let db;

try {
  const module = await import(useMongo ? './mongoDb.js' : './inMemoryDb.js');
  db = module.default;
} catch (error) {
  console.error('Failed to load database module:', error instanceof Error ? error.message : String(error));
  throw error;
}

export default db;
