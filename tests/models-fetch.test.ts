// 任务 4O 模型配置增强回归：models:test 空 content 不误报 + fetch-list 错误分类（本地确定性端点，不依赖外网）
import { describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fetchModelList, testModelConnectivity } from '../src/main/ai/models-ipc'

function jsonServer(handler: (body: string) => { status?: number; json: unknown }): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const srv: Server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const r = handler(body)
        res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(r.json))
      })
    })
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as AddressInfo).port
      resolve({ url: `http://127.0.0.1:${port}/v1`, close: () => srv.close() })
    })
  })
}

describe('任务 4O：models:test 判定放宽', () => {
  it('HTTP 200 空 content → ok:true + note（不再误报失败）', async () => {
    const s = await jsonServer(() => ({ json: { choices: [{ message: { content: '' } }] } }))
    try {
      const r = await testModelConnectivity({ baseUrl: s.url, apiKey: 'k', model: 'm' })
      expect(r.ok).toBe(true)
      expect(r.note).toBe('接口已连通，但模型未返回文本')
    } finally {
      s.close()
    }
  })

  it('HTTP 200 有 content → ok:true 无 note', async () => {
    const s = await jsonServer(() => ({ json: { choices: [{ message: { content: '正常' } }] } }))
    try {
      const r = await testModelConnectivity({ baseUrl: s.url, apiKey: 'k', model: 'm' })
      expect(r.ok).toBe(true)
      expect(r.note).toBeUndefined()
      expect(r.elapsedMs).toBeGreaterThanOrEqual(0)
    } finally {
      s.close()
    }
  })

  it('HTTP 401 → ok:false 且 message 含 401', async () => {
    const s = await jsonServer(() => ({ status: 401, json: { error: { message: 'bad key' } } }))
    try {
      const r = await testModelConnectivity({ baseUrl: s.url, apiKey: 'k', model: 'm' })
      expect(r.ok).toBe(false)
      expect(r.message ?? '').toContain('401')
    } finally {
      s.close()
    }
  })
})

describe('任务 4O：models:fetch-list', () => {
  it('GET {base}/models 解析 data[].id 去重排序', async () => {
    const s = await jsonServer(() => ({ json: { data: [{ id: 'b-model' }, { id: 'a-model' }, { id: 'b-model' }] } }))
    try {
      const r = await fetchModelList(s.url, 'k')
      expect(r.ok).toBe(true)
      expect(r.models).toEqual(['a-model', 'b-model'])
    } finally {
      s.close()
    }
  })

  it('格式不符（无 data[]）→ ok:false 明确报格式', async () => {
    const s = await jsonServer(() => ({ json: { object: 'list' } }))
    try {
      const r = await fetchModelList(s.url, 'k')
      expect(r.ok).toBe(false)
      expect(r.error ?? '').toContain('格式不符')
    } finally {
      s.close()
    }
  })

  it('401/403 → ok:false 明确报认证失败', async () => {
    const s = await jsonServer(() => ({ status: 403, json: {} }))
    try {
      const r = await fetchModelList(s.url, 'k')
      expect(r.ok).toBe(false)
      expect(r.error ?? '').toContain('认证失败')
    } finally {
      s.close()
    }
  })

  it('缺 base_url → ok:false', async () => {
    const r = await fetchModelList('', '')
    expect(r.ok).toBe(false)
    expect(r.error ?? '').toContain('base_url')
  })
})
