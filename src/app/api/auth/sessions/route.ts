import { NextResponse } from 'next/server';
import { apiError, serverError } from '@/lib/api-response';
import {
  destroyOtherSessions,
  destroySessionById,
  listSessions,
  readSessionToken,
  verifySession,
} from '@/lib/auth';

function currentToken(request: Request): string | null {
  const token = readSessionToken(request);
  return verifySession(token) ? token : null;
}

export async function GET(request: Request) {
  try {
    const token = currentToken(request);
    if (!token) return apiError('AUTH_REQUIRED', 'Authentication required', 401);

    const items = listSessions(token);
    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    return serverError('GET /auth/sessions', error, 'Failed to list sessions');
  }
}

export async function DELETE(request: Request) {
  try {
    const token = currentToken(request);
    if (!token) return apiError('AUTH_REQUIRED', 'Authentication required', 401);

    const { searchParams } = new URL(request.url);

    if (searchParams.get('others') === '1') {
      destroyOtherSessions(token);
      return NextResponse.json({ ok: true, revoked: 'others' });
    }

    const rawId = searchParams.get('id');
    const id = Number(rawId);
    if (!rawId || !Number.isSafeInteger(id) || id <= 0) {
      return apiError('MISSING_REQUIRED_FIELDS', 'Session id is required', 400, {
        details: { required: ['id'], alternative: 'others=1' },
      });
    }

    if (!destroySessionById(id, token)) {
      return apiError('SESSION_NOT_FOUND', 'Session not found', 404, { details: { id } });
    }

    return NextResponse.json({ ok: true, revoked: id });
  } catch (error) {
    return serverError('DELETE /auth/sessions', error, 'Failed to revoke session');
  }
}
