import { NextResponse } from 'next/server';
import { apiError, serverError } from '@/lib/api-response';
import {
  destroyOtherSessions,
  getAdminPasswordHash,
  readSessionToken,
  setAdminPassword,
  validatePassword,
  verifyPassword,
  verifySession,
} from '@/lib/auth';

/** 修改密码：必须提供当前密码，成功后踢掉其它会话。 */
export async function PUT(request: Request) {
  try {
    const token = readSessionToken(request);
    if (!verifySession(token)) {
      return apiError('AUTH_REQUIRED', 'Authentication required', 401);
    }

    const body = await request.json().catch(() => ({}));
    const current = typeof body.current_password === 'string' ? body.current_password : '';
    const next = body.new_password;

    const stored = getAdminPasswordHash();
    if (!stored || !(await verifyPassword(current, stored))) {
      return apiError('INVALID_PASSWORD', 'Current password is incorrect', 401);
    }

    const problem = validatePassword(next);
    if (problem) {
      return apiError('WEAK_PASSWORD', problem, 400, { details: { minLength: 8 } });
    }
    if (next === current) {
      return apiError('PASSWORD_UNCHANGED', 'New password must differ from the current one', 400);
    }

    await setAdminPassword(next);
    destroyOtherSessions(token!);

    return NextResponse.json({ ok: true, other_sessions_revoked: true });
  } catch (error) {
    return serverError('PUT /auth/password', error, 'Failed to change password');
  }
}
