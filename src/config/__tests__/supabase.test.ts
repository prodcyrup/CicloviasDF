import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOrsProxyUrl,
  getSupabaseConfig,
  hasSupabaseConfig,
} from '../providers';
import {
  getSupabaseClient,
  resetSupabaseClientForTests,
} from '../../cloud/supabaseClient';

const VALID_PUBLISHABLE_KEY = 'sb_publishable_aBcDeFgHiJkLmNoPqRsTuV123456';
const VALID_LEGACY_JWT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.sig1234567890';

afterEach(() => {
  vi.unstubAllEnvs();
  resetSupabaseClientForTests();
});

describe('providers.ts Supabase config auto-detection', () => {
  it('returns null / false when env vars are missing, blank, or whitespace-only', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    expect(getSupabaseConfig()).toBeNull();
    expect(hasSupabaseConfig()).toBe(false);
    expect(getOrsProxyUrl()).toBeNull();
    expect(getSupabaseClient()).toBeNull();

    vi.stubEnv('VITE_SUPABASE_URL', '   \t\n  ');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '   ');

    expect(getSupabaseConfig()).toBeNull();
    expect(hasSupabaseConfig()).toBe(false);
    expect(getOrsProxyUrl()).toBeNull();
  });

  it('rejects partial configurations (URL-only or key-only)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    expect(getSupabaseConfig()).toBeNull();
    expect(hasSupabaseConfig()).toBe(false);
    expect(getOrsProxyUrl()).toBeNull();

    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', VALID_PUBLISHABLE_KEY);

    expect(getSupabaseConfig()).toBeNull();
    expect(hasSupabaseConfig()).toBe(false);
    expect(getOrsProxyUrl()).toBeNull();
  });

  it('accepts modern sb_publishable_ keys with valid HTTPS URL', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', VALID_PUBLISHABLE_KEY);

    expect(getSupabaseConfig()).toEqual({
      url: 'https://demo-project.supabase.co',
      anonKey: VALID_PUBLISHABLE_KEY,
    });
    expect(hasSupabaseConfig()).toBe(true);
    expect(getOrsProxyUrl()).toBe(
      'https://demo-project.supabase.co/functions/v1/ors-proxy',
    );
  });

  it('accepts legacy JWT anon keys (eyJ...) with valid HTTPS URL', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://legacy-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', VALID_LEGACY_JWT_KEY);

    expect(getSupabaseConfig()).toEqual({
      url: 'https://legacy-project.supabase.co',
      anonKey: VALID_LEGACY_JWT_KEY,
    });
    expect(hasSupabaseConfig()).toBe(true);
    expect(getOrsProxyUrl()).toBe(
      'https://legacy-project.supabase.co/functions/v1/ors-proxy',
    );
  });

  it('trims surrounding whitespace and strips trailing slashes from URL', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '  https://demo.supabase.co///  ');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', `  ${VALID_PUBLISHABLE_KEY}  `);

    const cfg = getSupabaseConfig();
    expect(cfg).toEqual({
      url: 'https://demo.supabase.co',
      anonKey: VALID_PUBLISHABLE_KEY,
    });
    expect(getOrsProxyUrl()).toBe('https://demo.supabase.co/functions/v1/ors-proxy');
    expect(getOrsProxyUrl()).not.toContain('//functions');
  });

  it('accepts http://localhost and http://127.0.0.1 for local dev, and rejects insecure or malformed URLs', () => {
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', VALID_PUBLISHABLE_KEY);

    vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321/');
    expect(getSupabaseConfig()?.url).toBe('http://localhost:54321');
    expect(getOrsProxyUrl()).toBe('http://localhost:54321/functions/v1/ors-proxy');

    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    expect(getSupabaseConfig()?.url).toBe('http://127.0.0.1:54321');
    expect(getOrsProxyUrl()).toBe('http://127.0.0.1:54321/functions/v1/ors-proxy');

    const invalidUrls = [
      'http://example.com',
      'http://demo.supabase.co',
      'ftp://demo.supabase.co',
      'javascript:alert(1)',
      'not-a-url',
      'https://',
      'https://demo.supabase.co/has space',
    ];

    for (const badUrl of invalidUrls) {
      vi.stubEnv('VITE_SUPABASE_URL', badUrl);
      expect(getSupabaseConfig(), `Expected "${badUrl}" to be rejected`).toBeNull();
      expect(hasSupabaseConfig()).toBe(false);
    }
  });

  it('enforces key length >= 16 boundary and rejects internal whitespace', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo.supabase.co');

    // 15 chars -> rejected
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '123456789012345');
    expect(getSupabaseConfig()).toBeNull();
    expect(hasSupabaseConfig()).toBe(false);

    // 16 chars -> accepted
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '1234567890123456');
    expect(getSupabaseConfig()).toEqual({
      url: 'https://demo.supabase.co',
      anonKey: '1234567890123456',
    });
    expect(hasSupabaseConfig()).toBe(true);

    // Internal space -> rejected
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_abc def123456789');
    expect(getSupabaseConfig()).toBeNull();

    // Internal newline -> rejected
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_abc\ndef123456789');
    expect(getSupabaseConfig()).toBeNull();
  });
});

describe('supabaseClient.ts lazy singleton', () => {
  it('returns null when unconfigured without throwing in pure Node env', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    expect(getSupabaseClient()).toBeNull();
  });

  it('creates a memoized client for modern sb_publishable_ keys in Node env and resets cleanly', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', VALID_PUBLISHABLE_KEY);

    const c1 = getSupabaseClient();
    const c2 = getSupabaseClient();

    expect(c1).not.toBeNull();
    expect(c1).toBe(c2);
    expect(typeof c1?.auth.getSession).toBe('function');
    expect(typeof c1?.from).toBe('function');
    expect(typeof c1?.rpc).toBe('function');

    resetSupabaseClientForTests();
    const c3 = getSupabaseClient();
    expect(c3).not.toBeNull();
    expect(c3).not.toBe(c1);

    vi.unstubAllEnvs();
    resetSupabaseClientForTests();
    expect(getSupabaseClient()).toBeNull();
  });

  it('creates a valid client for legacy JWT anon keys in Node env', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://legacy-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', VALID_LEGACY_JWT_KEY);

    const client = getSupabaseClient();
    expect(client).not.toBeNull();
    expect(typeof client?.auth.getSession).toBe('function');
    expect(typeof client?.from).toBe('function');
    expect(typeof client?.rpc).toBe('function');
  });
});
