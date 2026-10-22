import { NextResponse } from 'next/server';
import { serverError } from '@/lib/api-response';
import { clearedSessionCookie, destroySession, readSessionToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    destroySession(readSessionToken(request));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(clearedSessionCookie(request));
    return response;
  } catch (error) {
    return serverError('POST /auth/logout', error, 'Failed to sign out');
  }
}
