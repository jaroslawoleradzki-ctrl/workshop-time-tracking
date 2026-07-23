export function getDatabaseName(databaseUrl: string | undefined): string {
  if (!databaseUrl || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is not defined or empty');
  }

  try {
    // If it's a valid URL, parse it using URL API
    if (databaseUrl.includes('://')) {
      const url = new URL(databaseUrl);
      const dbName = url.pathname.slice(1);
      if (!dbName) {
        throw new Error('Database name is empty in URL path');
      }
      return dbName;
    }
  } catch (e) {
    // Fall through to regex
  }

  // Fallback regex parsing (for connection strings that might fail URL parsing)
  const matches = databaseUrl.match(/\/([^\/?]+)(\?|$)/);
  if (matches && matches[1]) {
    return matches[1];
  }
  throw new Error('Could not parse database name from DATABASE_URL');
}

export function validateDatabaseName(dbName: string): boolean {
  return dbName.endsWith('_demo');
}
