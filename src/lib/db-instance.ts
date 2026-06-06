import { getDatabase, closeDatabase } from '../db';

let initialized = false;

export function initDb(dbPath?: string): void {
  if (!initialized) {
    try {
      getDatabase(dbPath);
      initialized = true;
    } catch (err) {
      throw new Error(`Failed to initialize database: ${err instanceof Error ? err.message : err}`);
    }
  }
}

export function getDb() {
  if (!initialized) {
    initDb();
  }
  return getDatabase();
}

export function closeDb(): void {
  try {
    closeDatabase();
  } catch (err) {
    console.error('[FluxDHCP] Error closing database:', err);
  }
  initialized = false;
}
