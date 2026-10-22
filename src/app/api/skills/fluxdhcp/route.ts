import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { apiError, serverError } from '@/lib/api-response';

/**
 * 让没有仓库副本的机器也能安装 skill。
 *
 *   curl -H "Authorization: Bearer <key>" http://host:3000/api/skills/fluxdhcp \
 *     -o ~/.codebuddy/skills/fluxdhcp/SKILL.md
 *
 * 传入 ?lang=zh 返回中文参考版。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILES = {
  en: 'SKILL.md',
  zh: 'SKILL.zh-CN.md',
} as const;

export async function GET(request: Request) {
  const denied = authorize(request, 'read');
  if (denied) return denied;

  try {
    const lang = new URL(request.url).searchParams.get('lang') === 'zh' ? 'zh' : 'en';
    const file = path.join(process.cwd(), 'resources', 'skills', 'fluxdhcp', FILES[lang]);

    if (!fs.existsSync(file)) {
      return apiError('SKILL_NOT_FOUND', 'Skill file not found', 404, {
        details: { path: file },
        hint: 'This deployment does not include the resources/skills directory.',
      });
    }

    return new NextResponse(fs.readFileSync(file, 'utf8'), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'inline; filename="SKILL.md"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return serverError('GET /api/skills/fluxdhcp', error, 'Failed to read skill');
  }
}
