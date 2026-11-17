const ESCAPE_MAP: Record<string, string> = {
  '\\n': '\n',
  '\\r': '\r',
  '\\t': '\t',
  '\\\\': '\\',
};

/**
 * 解析 webhook 字段中的转义序列（\n \r \t \\）。
 * 用户在单行输入框里无法输入真实换行，故用 \n 表示；发送前在此还原成真实字符。
 */
export function unescapeWebhookValue(value: string): string {
  if (!value || value.indexOf('\\') === -1) return value;
  return value.replace(/\\(?:n|r|t|\\)/g, (match) => ESCAPE_MAP[match] ?? match);
}
