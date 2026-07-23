export function getDatabaseName(databaseUrl: string | undefined): string {
  if (!databaseUrl || databaseUrl.trim() === '') {
    throw new Error('Brak wymaganej zmiennej DATABASE_URL.');
  }

  let url: URL;
  try {
    url = new URL(databaseUrl.trim());
  } catch {
    throw new Error('DATABASE_URL nie jest poprawnym adresem URL PostgreSQL.');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL musi używać protokołu postgresql:// lub postgres://.');
  }

  let dbName: string;
  try {
    dbName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('Nazwa bazy w DATABASE_URL zawiera niepoprawne kodowanie.');
  }

  if (!dbName || dbName.includes('/')) {
    throw new Error('DATABASE_URL musi zawierać jedną, poprawną nazwę bazy danych.');
  }

  return dbName;
}

export function validateDatabaseName(dbName: string): boolean {
  return dbName.endsWith('_demo');
}

export function validateDemoDatabaseUrl(databaseUrl: string | undefined): string {
  const dbName = getDatabaseName(databaseUrl);

  if (!validateDatabaseName(dbName)) {
    throw new Error('Seed demo może działać wyłącznie na bazie, której nazwa kończy się "_demo".');
  }

  return dbName;
}
