import { NextResponse } from 'next/server';
import { apiError, serverError } from '@/lib/api-response';
import {
  clearLoginFailures,
  clientIp,
  createSession,
  ensureAdminBootstrap,
  getAdminPasswordHash,
  isInitialized,
  loginLockRemaining,
  recordLoginFailure,
  sessionCookie,
  sleep,
  verifyPassword,
} from '@/lib/auth';

export async function POST(request: Request) {
  try {
    await ensureAdminBootstrap();

    const ip = clientIp(request);
    const remaining = loginLockRemaining(ip);
    if (remaining > 0) {
      return apiError('LOGIN_LOCKED', 'Too many failed attempts', 429, {
        details: { retryAfterSeconds: remaining },
        hint: `Try again in ${remaining}s.`,
      });
    }

    if (!isInitialized()) {
      return apiError('SETUP_REQUIRED', 'Admin password is not set yet', 409, {
        hint: 'Open the web UI to complete the initial setup.',
      });
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    const stored = getAdminPasswordHash();

    const ok = stored ? await verifyPassword(password, stored) : false;
    if (!ok) {
      recordLoginFailure(ip);
      // 统一延迟，钝化“密码对/错”的时间差
      await sleep(300);
      return apiError('INVALID_PASSWORD', 'Incorrect password', 401);
    }

    clearLoginFailures(ip);
    const { token, expiresAt } = createSession(request.headers.get('user-agent'));
    const response = NextResponse.json({ ok: true, expires_at: expiresAt });
    response.cookies.set(sessionCookie(request, token));
    return response;
  } catch (error) {
    return serverError('POST /auth/login', error, 'Failed to sign in');
  }
}
