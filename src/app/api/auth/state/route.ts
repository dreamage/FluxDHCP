import { NextResponse } from 'next/server';
import { ensureAdminBootstrap, isInitialized, readSessionToken, verifySession } from '@/lib/auth';
import { serverError } from '@/lib/api-response';

/** 公开接口：登录页据此决定显示“设置密码”还是“输入密码”。 */
export async function GET(request: Request) {
  try {
    await ensureAdminBootstrap();

    const session = verifySession(readSessionToken(request));
    return NextResponse.json({
      initialized: isInitialized(),
      authenticated: session !== null,
      expires_at: session?.expires_at ?? null,
    });
  } catch (error) {
    return serverError('GET /auth/state', error, 'Failed to read auth state');
  }
}
