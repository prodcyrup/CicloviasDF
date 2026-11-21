import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/providers';

interface CachedClient {
  cacheKey: string;
  client: SupabaseClient;
}

let cached: CachedClient | null = null;

/**
 * Storage adapter safe in restricted browser contexts (e.g., private browsing
 * where `window.localStorage` throws SecurityError/QuotaExceededError) and in
 * pure Node environments (Vitest).
 */
export function createSafeAuthStorage(): SupportedStorage {
  const memory = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      if (memory.has(key)) {
        return memory.get(key) ?? null;
      }
      if (typeof window !== 'undefined') {
        try {
          return window.localStorage.getItem(key);
        } catch {
          // Fall back to in-memory storage
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(key, value);
          memory.delete(key);
          return;
        } catch {
          // Fall back to in-memory storage
        }
      }
      memory.set(key, value);
    },
    removeItem(key: string): void {
      memory.delete(key);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // Ignore restricted storage errors
        }
      }
    },
  };
}

/**
 * Returns a lazily initialized, memoized Supabase client when valid
 * `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present, or `null`
 * in zero-key Guest/Local mode.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg) {
    return null;
  }

  const cacheKey = `${cfg.url}|${cfg.anonKey}`;
  if (cached && cached.cacheKey === cacheKey) {
    return cached.client;
  }

  const client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'eixoverde_auth_v1',
      storage: createSafeAuthStorage(),
    },
  });

  cached = { cacheKey, client };
  return client;
}

/**
 * Clears the memoized Supabase client instance between test cases.
 */
export function resetSupabaseClientForTests(): void {
  cached = null;
}
