/** Ensures documentation tooling can only write to a dedicated disposable database. */
export function assertDocsDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl) throw new Error('Documentation database URL is required');
  let parsed: URL;
  try { parsed = new URL(databaseUrl); } catch { throw new Error('Documentation database URL is invalid'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('Documentation database URL must use PostgreSQL');
  const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  if (!databaseName || !/^[A-Za-z0-9_]+$/.test(databaseName) || !databaseName.endsWith('_docs')) throw new Error('Documentation database name must end with _docs');
}
