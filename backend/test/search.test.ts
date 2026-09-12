import { describe, it, expect } from 'vitest';
import { hasNoSearchTerm, MAX_QUERY_LENGTH } from '../src/services/search';
import { searchQuerySchema } from '../src/routes/search';

/**
 * What lives here vs. elsewhere.
 *
 * The normalization and ranking rules are SQL — they can only be checked against
 * a real Postgres, so they are covered by `scripts/verify-search.ts`, which runs
 * the real service inside a transaction it rolls back. These tests cover the
 * parts that are plain TypeScript: what counts as "nothing to search for", and
 * whether query parameters are accepted, coerced and bounded.
 */

describe('hasNoSearchTerm', () => {
  it('treats empty and whitespace-only input as no search', () => {
    expect(hasNoSearchTerm('')).toBe(true);
    expect(hasNoSearchTerm('   ')).toBe(true);
    expect(hasNoSearchTerm('\t\n ')).toBe(true);
  });

  it('treats punctuation and symbols alone as no search', () => {
    // Without this, these reach Postgres and `ILIKE '%%'` matches every row —
    // a search box that "finds" the entire library.
    expect(hasNoSearchTerm('!!!')).toBe(true);
    expect(hasNoSearchTerm('...')).toBe(true);
    expect(hasNoSearchTerm('%')).toBe(true);
    expect(hasNoSearchTerm('_')).toBe(true);
    expect(hasNoSearchTerm('-')).toBe(true);
    expect(hasNoSearchTerm('«»')).toBe(true);
  });

  it('accepts real terms', () => {
    expect(hasNoSearchTerm('a')).toBe(false);
    expect(hasNoSearchTerm('صباح')).toBe(false);
    expect(hasNoSearchTerm('الصباح الجميل')).toBe(false);
    expect(hasNoSearchTerm('C++')).toBe(false); // operator symbols plus a letter
    expect(hasNoSearchTerm('٢٠٢٤')).toBe(false); // Arabic-Indic digits are terms
    expect(hasNoSearchTerm('2024')).toBe(false);
  });

  it('is not fooled by numbers or mixed content', () => {
    expect(hasNoSearchTerm('1')).toBe(false);
    expect(hasNoSearchTerm('a!')).toBe(false);
    expect(hasNoSearchTerm('!a')).toBe(false);
  });
});

describe('searchQuerySchema', () => {
  it('accepts an empty query so /search renders an empty state', () => {
    const parsed = searchQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.q).toBe('');
  });

  it('coerces page and limit from query strings', () => {
    const parsed = searchQuerySchema.safeParse({ q: 'x', page: '3', limit: '50' });
    expect(parsed.success && parsed.data).toMatchObject({ page: 3, limit: 50 });
  });

  it('bounds limit and page', () => {
    expect(searchQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ limit: 'not-a-number' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
  });

  it('rejects an over-long query rather than truncating it', () => {
    expect(searchQuerySchema.safeParse({ q: 'a'.repeat(MAX_QUERY_LENGTH) }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: 'a'.repeat(MAX_QUERY_LENGTH + 1) }).success).toBe(false);
  });
});
