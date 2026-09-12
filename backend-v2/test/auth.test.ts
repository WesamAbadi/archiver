import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ADMIN_USERNAME,
  generateSessionToken,
  hashSessionToken,
  verifyAdminCredentials,
} from '../src/auth';

const env = { ADMIN_USERNAME: 'wisam', ADMIN_PASSWORD: 'correct horse battery staple' };

describe('verifyAdminCredentials', () => {
  it('accepts the configured username + password', async () => {
    await expect(verifyAdminCredentials('wisam', env.ADMIN_PASSWORD, env)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    await expect(verifyAdminCredentials('wisam', 'wrong', env)).resolves.toBe(false);
  });

  it('rejects a wrong username', async () => {
    await expect(verifyAdminCredentials('someone-else', env.ADMIN_PASSWORD, env)).resolves.toBe(false);
  });

  it('rejects empty credentials', async () => {
    await expect(verifyAdminCredentials('', '', env)).resolves.toBe(false);
  });

  it('defaults the username to "admin" when ADMIN_USERNAME is unset', async () => {
    const noUsername = { ADMIN_PASSWORD: 'pw' };
    await expect(verifyAdminCredentials(DEFAULT_ADMIN_USERNAME, 'pw', noUsername)).resolves.toBe(true);
    await expect(verifyAdminCredentials('other', 'pw', noUsername)).resolves.toBe(false);
  });

  it('trims whitespace around the configured username', async () => {
    await expect(
      verifyAdminCredentials('wisam', env.ADMIN_PASSWORD, { ...env, ADMIN_USERNAME: '  wisam  ' }),
    ).resolves.toBe(true);
  });

  it('refuses every login when no password is configured', async () => {
    await expect(verifyAdminCredentials('admin', '', {})).resolves.toBe(false);
    await expect(verifyAdminCredentials('admin', 'anything', {})).resolves.toBe(false);
    await expect(verifyAdminCredentials('', '', {})).resolves.toBe(false);
  });
});

describe('session tokens', () => {
  it('generates 32 bytes of hex', () => {
    expect(generateSessionToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different token every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it('hashes deterministically to 64 hex chars', async () => {
    const hash = await hashSessionToken('some-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(hashSessionToken('some-token')).resolves.toBe(hash);
  });

  it('hashes different tokens differently', async () => {
    await expect(hashSessionToken('a')).not.toBe(await hashSessionToken('b'));
  });

  it('never stores the raw token as its own hash', async () => {
    const token = generateSessionToken();
    await expect(hashSessionToken(token)).not.toBe(token);
  });
});
