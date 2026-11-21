import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentSession,
  mapAuthErrorPtBr,
  sendPasswordReset,
  signInWithGoogle,
  signInWithMagicLink,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeAuthChanges,
  toAuthUser,
  updatePassword,
} from '../authService';
import * as supabaseClientMod from '../supabaseClient';

describe('authService.ts PT-BR error mapping & user normalization', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    supabaseClientMod.resetSupabaseClientForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    supabaseClientMod.resetSupabaseClientForTests();
  });

  it('normalizes Supabase User metadata into AuthUser', () => {
    expect(toAuthUser(null)).toBeNull();
    const u = toAuthUser({
      id: 'usr-123',
      email: 'ciclista@eixoverde.com.br',
      user_metadata: { display_name: 'Vítor Brasília' },
      app_metadata: {},
      aud: 'authenticated',
      created_at: '2026-11-21T00:00:00Z',
    });
    expect(u).toEqual({
      id: 'usr-123',
      email: 'ciclista@eixoverde.com.br',
      displayName: 'Vítor Brasília',
      avatarUrl: undefined,
    });
  });

  it('maps Supabase Auth errors to clear Brazilian Portuguese messages', () => {
    expect(mapAuthErrorPtBr(new Error('Invalid login credentials'))).toContain('E-mail ou senha incorretos');
    expect(mapAuthErrorPtBr(new Error('User already registered'))).toContain('já está cadastrado');
    expect(mapAuthErrorPtBr(new Error('Email not confirmed'))).toContain('Confirme seu e-mail');
    expect(mapAuthErrorPtBr(new Error('Password should be at least 6 characters'))).toContain('6 caracteres');
    expect(mapAuthErrorPtBr(new Error('Email rate limit exceeded'))).toContain('Muitas tentativas');
    expect(mapAuthErrorPtBr(new Error('Unsupported provider: provider is not enabled'))).toContain(
      'O login com Google ainda não foi ativado'
    );
    expect(mapAuthErrorPtBr(new Error('Failed to fetch'))).toContain('Sem conexão');
  });

  it('operates safely in Guest/Local mode when Supabase is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    const sess = await getCurrentSession();
    expect(sess).toEqual({ user: null, accessToken: null });

    const login = await signInWithPassword('user@eixoverde.com', '123456');
    expect(login.error).toContain('Modo Local');

    const googleLogin = await signInWithGoogle();
    expect(googleLogin.error).toContain('Modo Local');

    const unsub = subscribeAuthChanges(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('validates email & password before calling Supabase and delegates auth operations cleanly', async () => {
    const badEmail = await signInWithPassword('invalido', '123456');
    expect(badEmail.error).toContain('e-mail válido');

    const shortPass = await signInWithPassword('user@eixoverde.com', '123');
    expect(shortPass.error).toContain('6 caracteres');

    const mockAuth = {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'tok-abc',
            user: { id: 'u-1', email: 'vitor@df.gov.br', user_metadata: { display_name: 'Vítor' } },
          },
        },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: 'u-1', email: 'vitor@df.gov.br', user_metadata: { display_name: 'Vítor' } },
        },
        error: null,
      }),
      signUp: vi.fn().mockResolvedValue({
        data: {
          user: { id: 'u-2', email: 'novo@df.gov.br', user_metadata: { display_name: 'Novo' } },
          session: null,
        },
        error: null,
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.com' }, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    };

    vi.spyOn(supabaseClientMod, 'getSupabaseClient').mockReturnValue({
      auth: mockAuth,
    } as unknown as ReturnType<typeof supabaseClientMod.getSupabaseClient>);

    const sess = await getCurrentSession();
    expect(sess.user?.id).toBe('u-1');
    expect(sess.accessToken).toBe('tok-abc');

    const signInRes = await signInWithPassword('vitor@df.gov.br', 'senha123');
    expect(signInRes.user?.displayName).toBe('Vítor');

    const signUpRes = await signUpWithPassword('novo@df.gov.br', 'senha123', 'Novo');
    expect(signUpRes.needsEmailConfirmation).toBe(true);

    const otpRes = await signInWithMagicLink('vitor@df.gov.br');
    expect(otpRes.sent).toBe(true);

    const googleRes = await signInWithGoogle();
    expect(googleRes.redirected).toBe(true);
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );

    const resetRes = await sendPasswordReset('vitor@df.gov.br');
    expect(resetRes.sent).toBe(true);

    const updRes = await updatePassword('novaSenha123');
    expect(updRes.updated).toBe(true);

    const outRes = await signOut();
    expect(outRes.error).toBeUndefined();
  });
});
