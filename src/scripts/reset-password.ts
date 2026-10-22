/**
 * 重置管理员口令：
 *   1. 删除 admin_password_hash
 *   2. 清空全部登录会话
 *
 * 重置后系统回到“未初始化”状态，下次打开 Web UI 会要求重新设置密码。
 * 不做“生成随机密码并打印”，避免密码长期留在日志里。
 *
 * 用法：
 *   npm run reset-password
 *   docker exec -it fluxdhcp npm run reset-password
 */
import { getDatabase, resolveDbPath } from '../db';

function main() {
  const dbPath = resolveDbPath();
  const db = getDatabase();

  const passwordRow = db.prepare("SELECT value FROM config WHERE key = 'admin_password_hash'").get();
  const sessionCount = (db.prepare('SELECT COUNT(*) as count FROM admin_sessions').get() as { count: number }).count;

  const result = db.transaction(() => {
    const removed = db.prepare("DELETE FROM config WHERE key = 'admin_password_hash'").run();
    const revoked = db.prepare('DELETE FROM admin_sessions').run();
    return { removed: removed.changes, revoked: revoked.changes };
  })();

  console.log(`[FluxDHCP] database: ${dbPath}`);
  console.log(`[FluxDHCP] admin password was ${passwordRow ? 'set' : 'not set'}`);
  console.log(`[FluxDHCP] active sessions before reset: ${sessionCount}`);
  console.log(`[FluxDHCP] removed password: ${result.removed}, revoked sessions: ${result.revoked}`);
  console.log('[FluxDHCP] Admin password cleared. Open the web UI to set a new one.');

  db.close();
}

main();
