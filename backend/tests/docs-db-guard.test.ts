import { describe, expect, it } from 'vitest';
import { assertDocsDatabaseUrl } from '../prisma/docs-db-guard';
describe('documentation database guard', () => {
  it('accepts only a database name ending _docs', () => expect(() => assertDocsDatabaseUrl('postgresql://user:secret@localhost:5432/workshop_docs')).not.toThrow());
  it.each(['postgresql://user:secret@localhost:5432/workshop_dev', 'postgresql://user:secret@localhost:5432/workshop_demo', 'postgresql://user:secret@localhost:5432/workshop_production', 'not a URL', undefined])('rejects a non-docs target safely', (url) => expect(() => assertDocsDatabaseUrl(url)).toThrow('Documentation database'));
});
