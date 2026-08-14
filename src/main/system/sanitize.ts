// 脱敏工具（纯函数，可单测）：日志展示/诊断包导出前必须过一遍
// 保护对象：机器码 / API key / 长数字串（订单号等）/ 金额
export function sanitizeLine(line: string): string {
  let s = String(line ?? '')
  // 机器码 ECAI-xxxx…（允许十六进制与连字符）
  s = s.replace(/ECAI-[0-9a-fA-F-]{16,}/g, 'ECAI-***')
  // API key 常见前缀
  s = s.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
  s = s.replace(/api[_-]?key["']?\s*[:=]\s*["'][^"' ]{6,}["']/gi, 'apiKey=***')
  // 订单号/长数字串（16 位及以上连续数字）
  s = s.replace(/\b\d{16,}\b/g, '***')
  // 金额：¥ 或 元 前缀的数字
  s = s.replace(/¥\s?\d[\d,]*(?:\.\d+)?/g, '¥***')
  s = s.replace(/\d[\d,]*(?:\.\d+)?\s*元/g, '***元')
  return s
}

export function sanitizeText(text: string): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(sanitizeLine)
    .join('\n')
}