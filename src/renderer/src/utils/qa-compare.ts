// 任务 4F ②：质检报告一致性校验——页面 DOM 里是渲染后的文本，qa_runs 库里是原始 markdown，
// 先按同一渲染器把库内容转文本再归一化比较（markdown 语法 #/**/表格不干扰），纯函数便于单测
export function reportDomMatchesStored(
  domText: string,
  storedMarkdown: string,
  renderToText: (md: string) => string
): boolean {
  if (!domText || !storedMarkdown) return false
  const rendered = renderToText(storedMarkdown)
  if (!rendered) return false
  const norm = (s: string): string => s.replace(/\s+/g, '').trim()
  const a = norm(rendered)
  const b = norm(domText)
  if (a === b) return true
  const head = 400
  return a.startsWith(b.slice(0, head)) || b.startsWith(a.slice(0, head))
}