import { NextResponse } from 'next/server';
import { apiError, serverError } from '@/lib/api-response';
import {
  createSession,
  ensureAdminBootstrap,
  isInitialized,
  sessionCookie,
  setAdminPassword,
  validatePassword,
} from '@/lib/auth';

/** 首次初始化管理员密码。已初始化后永久关闭。 */
export async function POST(request: Request) {
  try {
    await ensureAdminBootstrap();

    if (isInitialized()) {
      return apiError('ALREADY_INITIALIZED', 'Admin password is already set', 409, {
        hint: 'Sign in with the existing password; use the CLI reset if it was lost.',
      });
    }

    const body = await request.json().catch(() => ({}));
    const problem = validatePassword(body.password);
    if (problem) {
      return apiError('WEAK_PASSWORD', problem, 400, {
        details: { minLength: 8 },
        hint: 'Use at least 8 characters.',
      });
    }

    await setAdminPassword(body.password);

    const { token, expiresAt } = createSession(request.headers.get('user-agent'));
    const response = NextResponse.json({ ok: true, expires_at: expiresAt }, { status: 201 });
    response.cookies.set(sessionCookie(request, token));
    return response;
  } catch (error) {
    return serverError('POST /auth/setup', error, 'Failed to initialize admin password');
  }
}
