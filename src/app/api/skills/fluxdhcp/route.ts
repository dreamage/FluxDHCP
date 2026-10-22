import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { apiError, serverError } from '@/lib/api-response';

/**
 * 公开的 skill 下载端点——无需 API Key。
 *
 *   curl -fsSL http://host:3000/api/skills/fluxdhcp \
 *     -o ~/.codebuddy/skills/fluxdhcp/SKILL.md
 *
 * 这是整套 API 里唯一的匿名端点：它只返回随程序分发的静态文档，
 * 不读取数据库、不暴露任何实例数据。传入 ?lang=zh 返回中文参考版。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FILES = {
  en: 'SKILL.md',
  zh: 'SKILL.zh-CN.md',
} as const;

export async function GET(request: Request) {
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
