// 验收辅助模块（仅 dev + EC_AI_AUTOSHOT=1 + ?autoshot=1 时运行）：
// 依次走 主题切换 -> 10 个页面 -> 三种弹窗 -> 最大化，每步截图到项目 shots/
import router from './router'
import { useSettingsStore } from './stores/settings'
import { useDialogStore } from './stores/dialog'
import { useShopsStore } from './stores/shops'
import { useProductImagesStore } from './stores/productImages'
import { useModelsStore } from './stores/models'
import { useCommentsStore } from './stores/comments'
import { useChatStore } from './stores/chat'
import { useDashboardStore } from './stores/dashboard'
import { useAuthStore } from './stores/auth'
import { gatePhase } from './utils/gate'
import { renderMarkdown } from './utils/markdown'
import { reportDomMatchesStored } from './utils/qa-compare'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function shot(name: string, rect?: { x: number; y: number; width: number; height: number }): Promise<void> {
  try {
    await window.api.debug.shot(name, rect)
  } catch {
    // 截图通道未注册（未开 EC_AI_AUTOSHOT）时静默跳过
  }
}

export async function runAutoshot(): Promise<void> {
  const settings = useSettingsStore()
  const dialog = useDialogStore()
  const images = useProductImagesStore()
  const shops = useShopsStore()

  async function log(line: string): Promise<void> {
    try {
      await window.api.debug.log(line)
    } catch {
      // 无 debug:log 通道时静默
    }
  }
  // 验收模式子流程：EC_AI_AUTOSHOT_MODE 指定（fix38=只重录安装后技能列表截图）
  const mode = new URLSearchParams(window.location.search).get('autoshot') ?? 'full'
  const subMode = mode !== 'full' && mode !== '1' ? mode : 'full'
  if (subMode !== 'full') {
    await settings.load()
    await log('AUTOSHOT-START:' + subMode)
    if (subMode === 'fix38') {
      await settings.setTheme('dark')
      await router.push('/skills')
      await sleep(900)
      await waitFor('.skill-row', 15000)
      const listT0 = Date.now()
      while (Date.now() - listT0 < 20000) {
        const skillRows = [...document.querySelectorAll<HTMLElement>('.skill-row')]
        if (skillRows.some((r) => /algorithmic-art/i.test(r.textContent ?? ''))) break
        await sleep(150)
      }
      await sleep(700)
      await shot('38-skills-installed-after')
    }
    await sleep(300)
    if (subMode === 'fix38b') {
      // 补录 38：真实走 GitHub 解析→安装→已安装列表→截图（验收要求列表含 algorithmic-art 等）
      await settings.setTheme('dark')
      await router.push('/skills')
      await sleep(900)
      await waitFor('.skill-row', 15000)
      const btnByText = (sel: string, text: string): HTMLElement | null =>
        [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(text)) ?? null
      btnByText('.tab', '从 GitHub 安装')?.click()
      await sleep(400)
      const linkInput = document.querySelector<HTMLInputElement>('.install-panel .input')
      if (linkInput) {
        linkInput.value = 'https://github.com/anthropics/skills'
        linkInput.dispatchEvent(new Event('input'))
        btnByText('button', '解析')?.click()
      }
      await waitFor('.cand-item', 120000)
      await sleep(600)
      await log('TASK5-FIX38B-CANDIDATES:' + String(document.querySelectorAll('.cand-item').length))
      btnByText('button', '安装所选')?.click()
      const installT0 = Date.now()
      let infoClicked = false
      while (Date.now() - installT0 < 60000) {
        const info = btnByText('button', '知道了') ?? btnByText('button', '确定')
        if (info && !infoClicked) {
          info.click()
          infoClicked = true
        }
        if (infoClicked && !info) break
        await sleep(200)
      }
      btnByText('.tab', '已安装技能')?.click()
      const listT0 = Date.now()
      while (Date.now() - listT0 < 20000) {
        const skillRows = [...document.querySelectorAll<HTMLElement>('.skill-row')]
        if (skillRows.some((r) => /algorithmic-art/i.test(r.textContent ?? ''))) break
        await sleep(150)
      }
      await sleep(700)
      await shot('38-skills-installed-after')
    }

    if (subMode === 'task6') {
      // 任务 6 验收：对话页 + 质检页（真实 Desktop 文件路径注入，走真实 parse/run IPC）
      await settings.setTheme('dark')
      await router.push('/chat')
      await sleep(1500)
      await shot('41-chat')
      await router.push('/qa')
      await sleep(1800)
      await shot('42-qa-prompt')
      ;(window as unknown as { __QA_ACCEPT_PATHS__?: string[] }).__QA_ACCEPT_PATHS__ = [
        'C:/Users/Administrator/Desktop/聊天记录/聊天记录1.csv',
        'C:/Users/Administrator/Desktop/聊天记录/聊天记录2.txt',
        'C:/Users/Administrator/Desktop/聊天记录/聊天记录3.json'
      ]
      await router.push('/chat')
      await sleep(300)
      await router.push('/qa')
      await sleep(2500)
      await shot('43-qa-import-preview')

      const runBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent ?? '').includes('开始质检'))
      runBtn?.click()
      await sleep(3000)
      await shot('44-qa-no-key-error')
    }

    if (subMode === 'task6-live') {
      // 任务 6 真实模型联验：DeepSeek 已配置为默认模型后，依次走 评语/质检/对话/附件/取数
      const models = useModelsStore()
      const comments = useCommentsStore()
      const chat = useChatStore()
      const dashboard = useDashboardStore()
      const btnByText = (sel: string, text: string): HTMLElement | null =>
        [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(text)) ?? null
      const waitIdle = async (fn: () => boolean, timeoutMs: number, stepMs = 1000): Promise<boolean> => {
        const t0 = Date.now()
        while (Date.now() - t0 < timeoutMs) {
          if (fn()) return true
          await sleep(stepMs)
        }
        return false
      }

      await settings.setTheme('dark')
      await shops.setDefault(1)
      await settings.selectShop('1')
      await sleep(600)

      // ---------- 1) 模型配置（应用内 safeStorage 加密 + 设默认） ----------
      const setup = await window.api.debug.modelSetup()
      await log('TASK6-LIVE-MODEL-SETUP:' + JSON.stringify(setup))
      await models.load()
      await log('TASK6-LIVE-MODELS:' + JSON.stringify(models.models.map((m) => ({ id: m.id, name: m.name, provider: m.provider, baseUrl: m.baseUrl, keySet: m.apiKeySet, isDefault: m.isDefault }))))
      await router.push('/settings')
      await sleep(1800)
      await shot('60-models-deepseek-default')

      // ---------- 2) 看板评语：自动生成（全店/单品） + 真实数字 + 同日同窗口去重 + 手动重调 ----------
      await router.push('/dashboard')
      await sleep(3000)
      await waitIdle(() => !comments.loading && comments.items.length >= 9 && comments.items.every((it) => it.status !== undefined && !it.loading), 360000, 1500)
      await sleep(1000)
      await log('TASK6-LIVE-COMMENTS-AUTO1:' + JSON.stringify(comments.items.map((it) => ({ module: it.module, status: it.status, skillName: it.skillName, model: it.model, len: it.content ? it.content.length : 0, head: it.content ? it.content.slice(0, 110) : null }))))
      await log('TASK6-LIVE-RULES:' + JSON.stringify(comments.rules))
      await shot('61-dashboard-comments-auto')
      // 同日同窗口重复打开：再次 auto，应全部 reuse
      await comments.auto()
      await waitIdle(() => !comments.loading, 90000)
      await log('TASK6-LIVE-COMMENTS-AUTO2-REUSE:' + JSON.stringify(comments.items.map((it) => ({ module: it.module, status: it.status }))))
      // 手动 force 重调单模块（摘要），应 generated 且内容刷新
      await comments.regenerate('摘要')
      await waitIdle(() => !comments.items.find((it) => it.module === '摘要')?.loading, 120000)
      await log('TASK6-LIVE-COMMENTS-REGEN:' + JSON.stringify(comments.items.find((it) => it.module === '摘要') ?? null))
      await shot('62-dashboard-comments-regen')

      // ---------- 3) 聊天质检：三格式解析 + 流式报告 + 复制/导出 + 历史 ----------
      const qaPaths = [
        'C:/Users/Administrator/Desktop/聊天记录/聊天记录1.csv',
        'C:/Users/Administrator/Desktop/聊天记录/聊天记录2.txt',
        'C:/Users/Administrator/Desktop/聊天记录/聊天记录3.json'
      ]
      ;(window as unknown as { __QA_ACCEPT_PATHS__?: string[] }).__QA_ACCEPT_PATHS__ = qaPaths
      await router.push('/qa')
      await sleep(2500)
      const qaParsed = (await window.api.qa.parse(qaPaths)) as { files: Array<{ name: string; count: number; error?: string }>; records: unknown[]; stats: { sessions: number; agents: string[]; start: string; end: string } }
      await log('TASK6-LIVE-QA-PARSE:' + JSON.stringify({ files: qaParsed.files, total: (qaParsed.records ?? []).length, stats: qaParsed.stats }))
      await shot('63-qa-import-preview')
      const qaPrompt = (await window.api.qa.promptGet()) as { currentText: string; exists: boolean; sourceFile: string }
      await log('TASK6-LIVE-QA-PROMPT:' + JSON.stringify({ exists: qaPrompt.exists, sourceFile: qaPrompt.sourceFile, promptLen: qaPrompt.currentText.length }))
      let qaChunks = 0
      let qaAcc = ''
      let qaDone: any = null
      let qaErr: any = null
      const offChunk = window.api.qa.onChunk((p) => { qaChunks += 1; qaAcc += p.delta })
      const offDone = window.api.qa.onDone((p) => { qaDone = p })
      const offErr = window.api.qa.onError((p) => { qaErr = p })
      const qaRes = (await window.api.qa.run({ paths: [...qaPaths], prompt: qaPrompt.currentText })) as { ok: boolean; message?: string }
      await log('TASK6-LIVE-QA-RUN-RES:' + JSON.stringify(qaRes))
      await waitIdle(() => !!qaDone || !!qaErr, 240000, 1000)
      await log('TASK6-LIVE-QA-STREAM:' + JSON.stringify({ chunks: qaChunks, accLen: qaAcc.length, doneElapsedMs: qaDone?.elapsedMs ?? null, stats: qaDone?.stats ?? null, err: qaErr?.message ?? null, head: qaAcc.slice(0, 260) }))
      // 导出 txt：拦截 <a download> blob 并阻止真实下载（避免 Electron 原生保存对话框卡住渲染层），
      // 直接校验导出 blob 内容与报告一致
      try {
        const origClick = HTMLAnchorElement.prototype.click
        let capturedBlobUrl: string | null = null
        HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
          if (this.download && this.href.startsWith('blob:')) {
            capturedBlobUrl = this.href
            return undefined
          }
          return origClick.call(this)
        }
        btnByText('button', '导出')?.click()
        await sleep(800)
        HTMLAnchorElement.prototype.click = origClick
        if (capturedBlobUrl) {
          const blobText = await (await fetch(capturedBlobUrl)).text()
          await log('TASK6-LIVE-QA-EXPORT:' + JSON.stringify({ len: blobText.length, head: blobText.slice(0, 120) }))
        } else {
          await log('TASK6-LIVE-QA-EXPORT:NO-BLOB')
        }
      } catch (err) {
        await log('TASK6-LIVE-QA-EXPORT-ERR:' + String((err as Error).message))
      }
      try {
        btnByText('button', '复制')?.click()
        await sleep(500)
        let clip = ''
        try {
          clip = await Promise.race([
            navigator.clipboard.readText(),
            new Promise<string>((resolve) => setTimeout(() => resolve('clipboard-read-timeout'), 4000))
          ])
        } catch {
          clip = 'clipboard-read-error'
        }
        await log('TASK6-LIVE-QA-COPY:' + JSON.stringify({ len: clip.length, head: clip.slice(0, 120), timedOut: clip === 'clipboard-read-timeout' }))
      } catch (err) {
        await log('TASK6-LIVE-QA-COPY-ERR:' + String((err as Error).message))
      }
      offChunk(); offDone(); offErr()
      await shot('64-qa-report-result')

      // ---------- 4) AI 对话：新会话流式回复 + 会话保存/切换/新建 ----------
      await router.push('/chat')
      await sleep(1800)
      await chat.create()
      const conv1 = chat.activeId
      await log('TASK6-LIVE-CHAT-CONV1:' + String(conv1))
      void chat.send('请用中文简要总结：当前店铺近7天的经营概况，包括支付金额、利润、退款金额、推广ROI，数字必须来自我提供的看板数据摘要，不要编造。')
      await sleep(2000)
      await shot('65-chat-streaming-typewriter')
      await waitIdle(() => !chat.sending && !chat.streaming, 180000, 1000)
      const lastMsg1 = chat.messages[chat.messages.length - 1]
      await log('TASK6-LIVE-CHAT1-DONE:' + JSON.stringify({ msgCount: chat.messages.length, replyLen: lastMsg1 && lastMsg1.role === 'assistant' ? lastMsg1.content.length : 0, replyHead: lastMsg1 && lastMsg1.role === 'assistant' ? lastMsg1.content.slice(0, 300) : null }))
      await shot('66-chat-conv1-reply')
      // 新会话 2
      await chat.create()
      const conv2 = chat.activeId
      void chat.send('不同会话隔离测试：请只回答两个字「隔离OK」。')
      await waitIdle(() => !chat.sending && !chat.streaming, 120000, 1000)
      await log('TASK6-LIVE-CHAT2-DONE:' + JSON.stringify({ conv2, msgCount: chat.messages.length, reply: chat.messages[chat.messages.length - 1]?.content?.slice(0, 60) }))
      await shot('67-chat-conv2')
      // 切回会话 1：内容不串
      await chat.open(conv1)
      await log('TASK6-LIVE-CHAT-BACK-CONV1:' + JSON.stringify({ msgCount: chat.messages.length, hasConv2Reply: chat.messages.some((m) => m.role === 'assistant' && m.content.includes('隔离OK')), firstHead: chat.messages[0]?.content?.slice(0, 60) ?? null }))

      // ---------- 5) 附件上传：csv + xlsx + 图片 ----------
      await chat.create()
      const attPaths = [
        'C:/Users/Administrator/Desktop/模板/2026-08-11.csv',
        'C:/Users/Administrator/Desktop/模板/店铺DSR数据_2026-08-11.xlsx',
        'C:/Users/Administrator/AppData/Roaming/EC AI/product-images/1/974661273911.png'
      ]
      await chat.addFiles(attPaths)
      await log('TASK6-LIVE-CHAT-ATT:' + JSON.stringify(chat.attachments.map((a) => ({ name: a.name, kind: a.kind, textLen: a.text ? a.text.length : 0, hasImage: !!a.base64, err: a.error ?? null }))))
      await shot('68-chat-attachments')
      void chat.send('请阅读附件回答：1) csv 咨询文件里共有几个商品？列出前3个商品名称及其总咨询人数；2) xlsx DSR 文件里 180 天区块「店铺综合评分」（或描述/物流/服务分）是多少？数字必须来自附件原文。')
      await waitIdle(() => !chat.sending && !chat.streaming, 180000, 1000)
      const attReply = chat.messages[chat.messages.length - 1]
      await log('TASK6-LIVE-CHAT-ATT-REPLY:' + JSON.stringify({ replyLen: attReply?.content?.length ?? 0, reply: attReply?.content ?? null }))
      await shot('69-chat-attachment-reply')
      // 图片单独发（deepseek-chat 无视觉，预期明确报错不静默）
      void chat.send('请描述这张图片里是什么。')
      await waitIdle(() => !chat.sending && !chat.streaming, 120000, 1000)
      await log('TASK6-LIVE-CHAT-IMG-ONLY:' + JSON.stringify({ error: chat.error || null, lastRole: chat.messages[chat.messages.length - 1]?.role, lastHead: chat.messages[chat.messages.length - 1]?.content?.slice(0, 200) ?? null }))

      // ---------- 6) 取数模板 + 看板数据引用 ----------
      const tpls = (await window.api.data.templates()) as Array<{ id: string; label: string; desc: string }>
      await log('TASK6-LIVE-TEMPLATES:' + JSON.stringify(tpls.map((t) => ({ id: t.id, label: t.label }))))
      const tplRes = (await window.api.data.query({ templateId: 'daily-range', params: { shopId: 1, from: '2026-08-07', to: '2026-08-13' } })) as Record<string, unknown>
      await log('TASK6-LIVE-TPL-DAILY-RANGE:' + JSON.stringify(tplRes).slice(0, 900))
      const dash = (await window.api.dashboard.get({ shopId: 1, mode: '7' })) as { window: { start: string; end: string; label: string }; kpi: Record<string, unknown> | null }
      await log('TASK6-LIVE-DASH-KPI:' + JSON.stringify({ window: dash.window, kpi: dash.kpi }))
      await chat.create()
      void chat.send('请用当前看板数据回答：近7天支付金额是多少？利润多少？退款金额多少？直接引用看板摘要中的数字。')
      await waitIdle(() => !chat.sending && !chat.streaming, 180000, 1000)
      const boardReply = chat.messages[chat.messages.length - 1]
      await log('TASK6-LIVE-CHAT-BOARD-REPLY:' + JSON.stringify({ replyLen: boardReply?.content?.length ?? 0, reply: boardReply?.content ?? null }))
      await shot('70-chat-board-data')

      await log('TASK6-LIVE-DONE')
    }

    if (subMode === 'task4f-onboarding') {
      // 任务 4F ①：引导页「创建店铺」占位统一为「例如：XX旗舰店」（真实操作点击到第 2 步）
      try {
        const btnByText = (sel: string, text: string): HTMLElement | null =>
          [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(text)) ?? null
        await settings.setTheme('dark')
        await log('QA4F-ONBOARDING-START')
        const t0 = Date.now()
        while (Date.now() - t0 < 10000 && !document.querySelector('.ob-shell')) await sleep(150)
        if (!document.querySelector('.ob-shell')) throw new Error('引导页未出现')
        await sleep(500)
        btnByText('button', '开始使用')?.click()
        await sleep(500)
        btnByText('button', '下一步')?.click()
        await sleep(600)
        const shopInput = document.querySelector<HTMLInputElement>('#ob-shop')
        await log('QA4F-ONBOARDING-PLACEHOLDER:' + JSON.stringify({ placeholder: shopInput?.placeholder ?? '', found: !!shopInput }))
        await shot('138-4f-onboarding-placeholder')
        await settings.setOnboardingDone(true)
        await log('TASK4F-ONBOARDING-DONE')
      } catch (e) {
        await log('TASK4F-ONBOARDING-ERR:' + String((e as Error)?.message ?? e))
      }
    }

    if (subMode === 'task4h-onboarding') {
      // 任务 4H 验收：新装实例向导 → 走到「配置 AI 模型」步骤（插在导入数据之后、首批评语之前）
      try {
        const btnByText = (sel: string, text: string): HTMLElement | null =>
          [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(text)) ?? null
        await settings.setTheme('dark')
        await log('QA4H-ONBOARDING-START')
        const t0 = Date.now()
        while (Date.now() - t0 < 10000 && !document.querySelector('.ob-shell')) await sleep(150)
        if (!document.querySelector('.ob-shell')) throw new Error('引导页未出现')
        await sleep(400)
        btnByText('button', '开始使用')?.click()
        await sleep(400)
        const userInput = document.querySelector<HTMLInputElement>('#ob-username')
        if (userInput) {
          userInput.value = '验收店长'
          userInput.dispatchEvent(new Event('input'))
        }
        btnByText('button', '下一步')?.click()
        await sleep(500)
        const shopInput = document.querySelector<HTMLInputElement>('#ob-shop')
        await log('QA4H-ONBOARDING-SHOP-PLACEHOLDER:' + JSON.stringify({ placeholder: shopInput?.placeholder ?? '', found: !!shopInput }))
        if (shopInput) {
          shopInput.value = '验收店铺'
          shopInput.dispatchEvent(new Event('input'))
        }
        btnByText('button', '下一步')?.click()
        await sleep(600)
        btnByText('button', '下一步')?.click()
        await sleep(900)
        const stepLabel = document.querySelector('.ob-step-label')?.textContent?.trim() ?? ''
        const hasPreset = !!document.querySelector('#ob-model-provider')
        const hasBase = !!document.querySelector('#ob-model-base')
        const hasKey = !!document.querySelector('#ob-model-key')
        const keyInput = document.querySelector<HTMLInputElement>('#ob-model-key')
        const keyType = keyInput?.getAttribute('type') ?? ''
        const testBtn = btnByText('button', '保存并测试')
        await log('QA4H-ONBOARDING-AI-STEP:' + JSON.stringify({ stepLabel, hasPreset, hasBase, hasKey, keyType, hasTestBtn: !!testBtn }))
        await shot('160-4h-wizard-ai-model')
        await settings.setOnboardingDone(true)
        await log('TASK4H-ONBOARDING-DONE')
      } catch (e) {
        await log('TASK4H-ONBOARDING-ERR:' + String((e as Error)?.message ?? e))
      }
    }

    if (subMode === 'task4f-splash') {
      // 任务 4F ⑤：开屏欢迎页——头像/用户名/时段问候/语录齐全；2026-08-15 起每次启动显示，设置可关
      try {
        await settings.setTheme('dark')
        await sleep(700)
        const pending = settings.splashPending()
        await log('QA4F-SPLASH-PENDING:' + pending)
        if (pending) {
          const t0 = Date.now()
          while (Date.now() - t0 < 6000 && !document.querySelector('.splash')) await sleep(80)
          const hasSplash = !!document.querySelector('.splash')
          await log('QA4F-SPLASH-RENDERED:' + hasSplash)
          if (hasSplash) {
            const name = document.querySelector('.splash-name')?.textContent?.trim() ?? ''
            const greet = document.querySelector('.splash-greet')?.textContent?.trim() ?? ''
            const sub = document.querySelector('.splash-sub')?.textContent?.trim() ?? ''
            const quote = document.querySelector('.splash-quote')?.textContent?.trim() ?? ''
            const avatarImg = !!document.querySelector('.splash-avatar img')
            await shot('144-4f-splash')
            await log('QA4F-SPLASH-CONTENT:' + JSON.stringify({ name, greet, sub, quote, avatarImg, nowDate: settings.now.dateStr, hour: settings.now.hour }))
            ;(document.querySelector('.splash') as HTMLElement | null)?.click()
            await sleep(900)
          }
        }
        const after = settings.splashPending()
        await log('QA4F-SPLASH-AFTER-ENTER:' + JSON.stringify({ splashPending: after, lastSplashDate: settings.lastSplashDate, nowDate: settings.now.dateStr }))
        await log('TASK4F-SPLASH-DONE')
      } catch (e) {
        await log('TASK4F-SPLASH-ERR:' + String((e as Error)?.message ?? e))
      }
    }

    if (subMode === 'task4f') {
      // 任务 4F 主流程：①店铺占位 ②质检切页保活 ③历史导出 md/txt/csv ④头像裁切/压缩/解码报错 ⑤设置-开屏开关 ⑥聊天输入区
      try {
        const btnByText = (sel: string, text: string): HTMLElement | null =>
          [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(text)) ?? null
        const waitFor = async (sel: string, ms = 8000): Promise<boolean> => {
          const t0 = Date.now()
          while (Date.now() - t0 < ms) {
            if (document.querySelector(sel)) return true
            await sleep(120)
          }
          return false
        }
        // 任务 4F 验收：按用户指示质检只提交一份真实文件（聊天记录3.json，25 会话/781 条），减少模型消耗
        const qaPaths4f = [
          'C:/Users/Administrator/Desktop/聊天记录/聊天记录3.json'
        ]
        const q = new URLSearchParams(window.location.search)
        await settings.setTheme('dark')
        // 等授权门禁/开屏/引导结束、主界面渲染完成，避免首屏竞态
        const tApp = Date.now()
        while (Date.now() - tApp < 20000 && !document.querySelector('.app-body')) await sleep(150)
        await shops.setDefault(1)
        await settings.selectShop('1')
        await sleep(600)

        // ---------- ① 店铺管理占位（ImportView 默认在数据导入 tab，先切到店铺管理） ----------
        await router.push('/import')
        await sleep(1200)
        const tabCount4f = document.querySelectorAll('.tab').length
        const hasTabs4f = !!document.querySelector('.tabs')
        const clickOk4f = !!btnByText('.tab', '店铺管理')
        btnByText('.tab', '店铺管理')?.click()
        const inputReady = await waitFor('.add-row input', 8000)
        await sleep(200)
        const shopInput = document.querySelector<HTMLInputElement>('.add-row input')
        await log('QA4F-SHOP-PLACEHOLDER:' + JSON.stringify({ placeholder: shopInput?.placeholder ?? '', found: !!shopInput, inputReady, tabCount: tabCount4f, hasTabs: hasTabs4f, clickOk: clickOk4f, url: location.hash }))
        await shot('137-4f-shop-placeholder')

        // ---------- ⑤ 设置-开屏开关（检查不被测试补丁改坏） ----------
        await router.push('/settings')
        await sleep(800)
        await waitFor('button[role="switch"][aria-label="开屏欢迎页"]', 8000)
        await sleep(300)
        const sw = document.querySelector<HTMLElement>('button[role="switch"][aria-label="开屏欢迎页"]') ?? [...document.querySelectorAll<HTMLElement>('button[role="switch"]')].find((b) => (b.getAttribute('aria-label') ?? '').includes('开屏')) ?? null
        const before = (await window.api.settings.get()) as { splashEnabled?: boolean }
        sw?.click()
        await sleep(600)
        const afterOff = (await window.api.settings.get()) as { splashEnabled?: boolean }
        sw?.click()
        await sleep(600)
        const afterOn = (await window.api.settings.get()) as { splashEnabled?: boolean }
        await log('QA4F-SETTINGS-SPLASH-TOGGLE:' + JSON.stringify({ found: !!sw, switchCount: document.querySelectorAll('button[role="switch"]').length, before: before.splashEnabled, afterOff: afterOff.splashEnabled, afterOn: afterOn.splashEnabled }))
        await shot('145-4f-splash-settings-toggle')

        // ---------- ④ 头像：正常尺寸 / 超大图裁切压缩 / 解码失败 ----------
        const smallPath = q.get('avatarSmall') ?? ''
        const bigPath = q.get('avatarBig') ?? ''
        const badPath = q.get('avatarBad') ?? ''
        if (smallPath) {
          const r1 = (await window.api.debug.avatarFromPath(smallPath)) as { ok: boolean; avatar?: string; error?: string; width?: number; height?: number; processed?: boolean }
          await log('QA4F-AVATAR-SMALL:' + JSON.stringify(r1))
          if (r1.ok && r1.avatar) {
            await settings.setProfile({ username: settings.profile.username || '店主', avatar: r1.avatar })
            await router.push('/settings')
            await sleep(800)
            await shot('142-4f-avatar-normal')
          }
        }
        if (bigPath) {
          const r2 = (await window.api.debug.avatarFromPath(bigPath)) as { ok: boolean; avatar?: string; error?: string; width?: number; height?: number; processed?: boolean }
          await log('QA4F-AVATAR-BIG:' + JSON.stringify(r2))
          if (r2.ok && r2.avatar) {
            await settings.setProfile({ username: settings.profile.username || '店主', avatar: r2.avatar })
            await router.push('/settings')
            await sleep(800)
            await shot('143-4f-avatar-processed')
          }
        }
        if (badPath) {
          const r3 = (await window.api.debug.avatarFromPath(badPath)) as { ok: boolean; error?: string }
          await log('QA4F-AVATAR-DECODE-ERR:' + JSON.stringify(r3))
        }

        // ---------- ⑥ 聊天输入区（GPT 式重做验证） ----------
        const chat4f = useChatStore()
        await chat4f.create()
        await router.push('/chat')
        await sleep(1400)
        const ta = document.querySelector<HTMLTextAreaElement>('.composer textarea')
        const h1 = ta?.offsetHeight ?? 0
        await shot('146-4f-chat-input')
        ;(document.querySelector<HTMLElement>('.attach-btn'))?.click()
        await sleep(450)
        const menuRect = document.querySelector<HTMLElement>('.attach-menu')?.getBoundingClientRect()
        await log('QA4F-CHAT-ATTACH:' + JSON.stringify({
          open: !!menuRect, items: document.querySelectorAll('.attach-menu button').length,
          left: menuRect ? Math.round(menuRect.left) : null, top: menuRect ? Math.round(menuRect.top) : null,
          width: menuRect ? Math.round(menuRect.width) : null, height: menuRect ? Math.round(menuRect.height) : null
        }))
        await shot('147-4f-chat-input-attach')
        ;(document.querySelector<HTMLElement>('.attach-btn'))?.click()
        if (ta) {
          ta.value = '第一行问题\n第二行补充说明\n第三行继续写多一点，看看 textarea 自适应高度会不会把附件按钮和发送按钮挤变形'
          ta.dispatchEvent(new Event('input'))
          await sleep(600)
        }
        const h2 = document.querySelector<HTMLTextAreaElement>('.composer textarea')?.offsetHeight ?? 0
        await log('QA4F-CHAT-AUTOGROW:' + JSON.stringify({ h1, h2, grown: h2 > h1 }))
        await shot('148-4f-chat-input-grown')

        // ---------- ② 质检切页保活：开始质检 → 切走 → 切回 → 已输出保留并继续 → 完成与落库一致 ----------
        ;(window as unknown as { __QA_ACCEPT_PATHS__?: string[] }).__QA_ACCEPT_PATHS__ = qaPaths4f
        await router.push('/qa')
        await sleep(2500)
        await waitFor('.stats-line', 20000)
        await sleep(600)
        const histBefore = (await window.api.qa.history()) as Array<{ id: number }>
        const beforeId = histBefore[0]?.id ?? 0
        btnByText('button', '开始质检')?.click()
        const tStream = Date.now()
        while (Date.now() - tStream < 120000) {
          const txt = document.querySelector<HTMLElement>('.report .md')?.textContent ?? ''
          if (txt.length > 150) break
          await sleep(1000)
        }
        const partA = document.querySelector<HTMLElement>('.report .md')?.textContent ?? ''
        await log('QA4F-KEEPALIVE-NAV-AWAY:' + JSON.stringify({ lenBeforeNav: partA.length, sample: partA.slice(0, 100) }))
        await shot('139-4f-qa-stream-during')
        await router.push('/chat')
        await sleep(2500)
        await router.push('/qa')
        await sleep(1800)
        const stillRunning = !!btnByText('button', '质检中...')
        const partB = document.querySelector<HTMLElement>('.report .md')?.textContent ?? ''
        // 流式 markdown 渲染中表格/列表未闭合时前缀文本可能微调（如半截表格带 |），
        // 因此用「归一化 + 稳定窗口」判定续接：已输出内容增长且报告开头仍一致
        const normTxt4f = (s: string): string => s.replace(/\s+/g, '')
        const contWindow = Math.min(normTxt4f(partA).length, 150)
        let firstDiffAt = -1
        {
          const a = normTxt4f(partA).slice(0, contWindow)
          const b = normTxt4f(partB)
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            if (a[i] !== b[i]) { firstDiffAt = i; break }
          }
        }
        const headerOk = normTxt4f(partB).includes('电商客服聊天质检报告')
        const continuous = partB.length >= partA.length && (firstDiffAt === -1 || headerOk)
        await log('QA4F-KEEPALIVE-AFTER-RETURN:' + JSON.stringify({ lenBefore: partA.length, lenAfter: partB.length, continuous, stillRunning, firstDiffAt, headerOk, sample: partB.slice(0, 100) }))
        await shot('140-4f-qa-stream-after-return')
        // 等待完成：以 qa_runs 新落库行为准（真实模型 2351 条约 35 分钟）
        const tDone = Date.now()
        let doneStatus = ''
        while (Date.now() - tDone < 2400000) {
          const h = (await window.api.qa.history()) as Array<{ id: number; status: string }>
          const top = h[0]
          if (top && top.id > beforeId) { doneStatus = top.status; break }
          await sleep(4000)
        }
        await sleep(3000)
        let finalDom = document.querySelector<HTMLElement>('.report .md')?.textContent ?? ''
        for (let tries = 0; finalDom.length < 50 && tries < 15; tries++) {
          await sleep(2000)
          finalDom = document.querySelector<HTMLElement>('.report .md')?.textContent ?? ''
        }
        const hist4f = (await window.api.qa.history()) as Array<{ id: number; report: string; status: string; sessionCount: number; agentCount?: number }>
        const latest = hist4f[0]
        const renderToText = (md: string): string => {
          if (!md) return ''
          const tmp = document.createElement('div')
          tmp.innerHTML = renderMarkdown(md)
          return tmp.textContent ?? ''
        }
        const matchesStored = !!latest && latest.status === 'ok' && reportDomMatchesStored(finalDom, latest.report ?? '', renderToText)
        await log('QA4F-KEEPALIVE-FINAL:' + JSON.stringify({
          domLen: finalDom.length, storedLen: latest?.report?.length ?? 0,
          status: latest?.status ?? null, sessions: latest?.sessionCount ?? 0, agents: latest?.agentCount ?? 0,
          matchesStored, head: finalDom.slice(0, 80), doneStatus, beforeId
        }))

        // ---------- ③ 质检历史导出：单条 md/txt + 批量 csv（拦截 blob 直读，校验与库中一致） ----------
        await sleep(1500)
        await shot('141-4f-qa-history-export')
        await waitFor('.hist-actions button', 15000)
        const origClick4f = HTMLAnchorElement.prototype.click
        const origCreateUrl4f = URL.createObjectURL
        const blobByUrl4f: Record<string, Blob> = {}
        const captured4f: Array<{ download: string; blob: Blob | null }> = []
        URL.createObjectURL = function (blob: Blob | MediaSource) {
          const url = origCreateUrl4f(blob)
          if (blob instanceof Blob) blobByUrl4f[url] = blob
          return url
        }
        HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
          if (this.download && this.href.startsWith('blob:')) {
            captured4f.push({ download: this.download, blob: blobByUrl4f[this.href] ?? null })
            return undefined
          }
          return origClick4f.call(this)
        }
        const rowBtns = [...document.querySelectorAll<HTMLButtonElement>('.hist-actions button')]
        rowBtns[0]?.click()
        await sleep(700)
        rowBtns[1]?.click()
        await sleep(700)
        btnByText('button', '导出汇总 CSV')?.click()
        await sleep(900)
        HTMLAnchorElement.prototype.click = origClick4f
        URL.createObjectURL = origCreateUrl4f
        const exports4f: Array<Record<string, unknown>> = []
        for (const c of captured4f) {
          const text = c.blob ? await c.blob.text() : ''
          exports4f.push({ download: c.download, len: text.length, head: text.slice(0, 120) })
        }
        const mdMatch = !!latest && exports4f[0]?.len === (latest.report ?? '').length
        const csvOk = exports4f.some((e) => String(e.download).endsWith('.csv') && String(e.head).includes('时间,文件数,会话数,客服数'))
        await log('QA4F-HISTORY-EXPORT:' + JSON.stringify({ captured: exports4f.length, names: exports4f.map((e) => e.download), mdMatch, csvOk }))

        // 还原头像与用户名（保持验收前状态）
        await settings.setProfile({ username: settings.profile.username || '店主', avatar: 'a1' })
        await log('TASK4F-DONE')
      } catch (e) {
        await log('TASK4F-ERR:' + String((e as Error)?.message ?? e))
        await log('TASK4F-DONE')
      }
    }

    if (subMode === 'task4g') {
      // 任务 4G 验收：①模板示例（13/0.6/12.82%/达标）②超红线告警（需压低 2.52 元/投产比 10.42）
      // ③一键带入近7天真实数据 ④历史保存/删除/导出 CSV ⑤AI 建议无 key 提示不崩 ⑥截图
      try {
        const btnByText = (sel: string, text: string): HTMLElement | null =>
          [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(text)) ?? null
        const waitFor = async (sel: string, ms = 8000): Promise<boolean> => {
          const t0 = Date.now()
          while (Date.now() - t0 < ms) {
            if (document.querySelector(sel)) return true
            await sleep(120)
          }
          return false
        }
        const setInput = (k: string, value: string): void => {
          const el = document.querySelector<HTMLInputElement>('input[data-k="' + k + '"]')
          if (!el) return
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        const getInput = (k: string): string => document.querySelector<HTMLInputElement>('input[data-k="' + k + '"]')?.value ?? ''
        const metrics = (): string[] => [...document.querySelectorAll<HTMLElement>('.m-value')].map((x) => x.textContent ?? '')
        const gaugeVal = (): string => document.querySelector<HTMLElement>('.gauge-val')?.textContent ?? ''
        const gaugeStatus = (): string => document.querySelector<HTMLElement>('.gauge-status')?.textContent?.trim() ?? ''

        await settings.setTheme('dark')
        await router.push('/roi')
        await sleep(1400)
        await waitFor('.roi-layout', 12000)

        // ---------- ① 模板示例：花费10/成交130/退款金额52（互推退款率40%）/毛利率30/目标16 ----------
        setInput('spend', '10')
        setInput('sales', '130')
        setInput('refundAmount', '52')
        setInput('margin', '0.3')
        setInput('target', '0.16')
        await sleep(700)
        await log('TASK4G-CALC:' + JSON.stringify({
          roi: metrics()[0], netRate: metrics()[1], netSales: metrics()[2], marketing: metrics()[3],
          breakEven: metrics()[4], minRoi: metrics()[5], gauge: gaugeVal(), status: gaugeStatus(),
          refundRateDerived: getInput('refundRate'), refundAmountDerived: getInput('refundAmount')
        }))
        await shot('149-4g-calc-template')

        // ---------- ② 超红线告警：花费 15 → 未达标，需压低 2.52 元 / 投产比提升到 10.42 ----------
        setInput('spend', '15')
        await sleep(500)
        const alarm = document.querySelector<HTMLElement>('.alarm')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
        await log('TASK4G-ALARM:' + JSON.stringify({
          status: gaugeStatus(), roi: metrics()[0], minRoi: metrics()[5],
          alarm: alarm.slice(0, 160), redline: (document.querySelector<HTMLElement>('.redline')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
        }))
        await shot('150-4g-gauge-alarm')
        setInput('spend', '10')
        await sleep(400)

        // ---------- ③ 一键带入近7天真实数据 ----------
        const sel = document.querySelector<HTMLSelectElement>('.import-row select')
        if (sel) { sel.value = '7'; sel.dispatchEvent(new Event('change')) }
        await sleep(300)
        btnByText('button', '一键带入')?.click()
        const tImp = Date.now()
        while (Date.now() - tImp < 15000) {
          const info = document.querySelector<HTMLElement>('.import-info')?.textContent ?? ''
          if (info && !info.includes('带入中')) break
          await sleep(300)
        }
        await sleep(600)
        const info = document.querySelector<HTMLElement>('.import-info')?.textContent ?? ''
        await log('TASK4G-IMPORT:' + JSON.stringify({
          spend: getInput('spend'), sales: getInput('sales'), refundAmount: getInput('refundAmount'),
          refundRate: getInput('refundRate'), info: info.slice(0, 200)
        }))
        await shot('151-4g-import-real-data')

        // ---------- ④ 历史：保存 → 列表出现 → 导出 CSV（拦截 blob）→ 删除 ----------
        setInput('name', '验收-近7天')
        await sleep(300)
        btnByText('button', '保存本次')?.click()
        const tSave = Date.now()
        while (Date.now() - tSave < 8000) {
          if ((document.querySelector<HTMLElement>('.saved-tip')?.textContent ?? '').includes('已保存')) break
          await sleep(200)
        }
        await sleep(500)
        const rows = [...document.querySelectorAll<HTMLElement>('.hist-row')].map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim())
        await log('TASK4G-HISTORY-SAVE:' + JSON.stringify({ count: rows.length, first: rows[0]?.slice(0, 90) }))
        await shot('152-4g-history-saved')

        const origClick = HTMLAnchorElement.prototype.click
        const origCreateUrl = URL.createObjectURL
        const blobMap4g: Record<string, Blob> = {}
        let capturedBlobUrl4g: string | null = null
        let capturedName4g = ''
        HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
          if (this.download && this.href.startsWith('blob:')) {
            capturedBlobUrl4g = this.href
            capturedName4g = this.download
            return undefined
          }
          return origClick.call(this)
        }
        URL.createObjectURL = function (blob: Blob | MediaSource) {
          const url = origCreateUrl(blob)
          if (blob instanceof Blob) blobMap4g[url] = blob
          return url
        }
        btnByText('button', '导出 CSV')?.click()
        await sleep(900)
        HTMLAnchorElement.prototype.click = origClick
        URL.createObjectURL = origCreateUrl
        if (capturedBlobUrl4g) {
          const blob4g: Blob | undefined = blobMap4g[capturedBlobUrl4g]
          if (blob4g) {
            // Blob.text() 解码 UTF-8 会剥掉开头 BOM，须按字节校验（EF BB BF）
            const bytes = new Uint8Array(await blob4g.arrayBuffer())
            const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
            const text = new TextDecoder('utf-8').decode(bytes.subarray(bom ? 3 : 0))
            const csvHead = text.slice(0, 200)
            await log('TASK4G-CSV:' + JSON.stringify({ name: capturedName4g, len: text.length, bom, head: csvHead.replace(/[\r\n]+/g, '|') }))
          } else {
            await log('TASK4G-CSV:NO-BLOB')
          }
        } else {
          await log('TASK4G-CSV:NO-BLOB')
        }
        // 删除该条历史（验收删除可用）
        const delBtn = document.querySelector<HTMLElement>('.hist-row .btn-mini.danger')
        delBtn?.click()
        await sleep(600)
        const rowsAfter = document.querySelectorAll<HTMLElement>('.hist-row').length
        await log('TASK4G-HISTORY-DELETE:' + JSON.stringify({ before: rows.length, after: rowsAfter, deleted: rowsAfter < rows.length }))

        // ---------- ⑤ AI 建议：无 key（主流程由验收脚本临时停用模型）→ 明确提示不崩 ----------
        btnByText('button', '生成建议')?.click()
        const tAdv = Date.now()
        let advErr = ''
        while (Date.now() - tAdv < 15000) {
          advErr = document.querySelector<HTMLElement>('.advice-error')?.textContent ?? ''
          const txt = document.querySelector<HTMLElement>('.advice-text')?.textContent ?? ''
          if (advErr || txt) break
          await sleep(300)
        }
        await log('TASK4G-ADVICE:' + JSON.stringify({ error: advErr.slice(0, 120), hasText: !!document.querySelector<HTMLElement>('.advice-text') }))
        await shot('153-4g-advice-no-key')

        await log('TASK4G-DONE')
      } catch (e) {
        await log('TASK4G-ERR:' + String((e as Error)?.message ?? e))
        await log('TASK4G-DONE')
      }
    }

    if (subMode === 'task4d') {
      // 任务 4D 验收：①技能拉取 GitHub 仓库连续 3 次（窗口全程可操作 + 候选列表或明确中文报错 + 可取消）；
      // ②三文件 2351 条完整质检（按会话分批合并 + finish_reason 检查，报告含 30 会话与总结段）
      try {
        const GITHUB_URL = 'https://github.com/jnMetaCode/agency-agents-zh'
        const qaPaths4d = [
          'C:/Users/Administrator/Desktop/聊天记录/聊天记录1.csv',
          'C:/Users/Administrator/Desktop/聊天记录/聊天记录2.txt',
          'C:/Users/Administrator/Desktop/聊天记录/聊天记录3.json'
        ]
        const btnByText = (sel: string, text: string): HTMLElement | null =>
          [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(text)) ?? null
        const runQa4d = new URLSearchParams(window.location.search).get('qa') !== '0'
        await settings.setTheme('dark')
        await shops.setDefault(1)
        await settings.selectShop('1')
        await sleep(600)

        // ---------- ① 技能拉取：连续 3 次解析 + 响应性采样 + 可取消 ----------
        await router.push('/skills')
        await waitFor('.tab', 8000)
        await sleep(300)
        const installTab = btnByText('.tab', '从 GitHub 安装')
        if (!installTab) throw new Error('未找到「从 GitHub 安装」tab')
        installTab.click()
        let panelShown = await waitFor('.install-panel', 8000)
        if (!panelShown) {
          // 首次点击可能落在路由过渡期：重试一次
          btnByText('.tab', '从 GitHub 安装')?.click()
          panelShown = await waitFor('.install-panel', 8000)
        }
        if (!panelShown) throw new Error('安装面板未渲染')
        await sleep(300)
        await shot('130-4d-skills-page')
        const linkInput = document.querySelector<HTMLInputElement>('.install-panel .input')
        if (!linkInput) throw new Error('未找到技能安装输入框')
        linkInput.value = GITHUB_URL
        linkInput.dispatchEvent(new Event('input'))
        await sleep(200)
        for (let run = 1; run <= 3; run++) {
          const baseT0 = Date.now()
          await window.api.skills.list()
          const baseMs = Date.now() - baseT0
          btnByText('button', '解析')?.click()
          const parseT0 = Date.now()
          // 解析期间每 ~800ms 做一次 IPC 往返，验证主进程未被同步阻塞（阻塞则采样会挂起）
          const lat: number[] = []
          const respTimer = setInterval(() => {
            const t0 = Date.now()
            void window.api.skills.list().then(() => lat.push(Date.now() - t0)).catch(() => lat.push(-1))
          }, 800)
          let outcome = 'pending'
          while (Date.now() - parseT0 < 75000) {
            if (document.querySelectorAll('.cand-item').length > 0) { outcome = 'candidates'; break }
            const modalBtn = btnByText('button', '知道了') ?? btnByText('button', '确定')
            if (modalBtn) { outcome = 'error'; break }
            await sleep(500)
          }
          clearInterval(respTimer)
          if (outcome === 'pending') outcome = 'timeout'
          await sleep(600)
          const elapsed = Date.now() - parseT0
          const candCount = document.querySelectorAll('.cand-item').length
          const errText = (document.querySelector('.dialog')?.textContent ?? document.querySelector('.modal')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
          await log('SKILLS4D-RUN' + run + ':' + JSON.stringify({
            outcome, elapsedMs: elapsed, candidates: candCount,
            baseIpcMs: baseMs, maxIpcMs: lat.length ? Math.max(...lat) : null, ipcSamples: lat.length,
            responsive: lat.length === 0 || lat.every((v) => v >= 0 && v < 5000),
            err: outcome === 'error' ? errText : null
          }))
          await shot('13' + (0 + run) + '-4d-skills-run' + run)
          // 清掉弹窗/结果，准备下一次
          const okBtn = btnByText('button', '知道了') ?? btnByText('button', '确定')
          okBtn?.click()
          await sleep(800)
        }
        // 可取消：开始第 4 次解析后点「取消」，应快速恢复（≤3s）
        btnByText('button', '解析')?.click()
        await sleep(1500)
        const cancelT0 = Date.now()
        btnByText('button', '取消')?.click()
        let cancelDone = false
        for (let i = 0; i < 20; i++) {
          await sleep(300)
          const stillParsing = [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes('解析中'))
          if (!stillParsing) { cancelDone = true; break }
        }
        await log('SKILLS4D-CANCEL:' + JSON.stringify({ cancelMs: Date.now() - cancelT0, done: cancelDone }))
        await shot('134-4d-skills-after-cancel')

        // ---------- ② 聊天质检：三文件 2351 条完整质检 ----------
        if (!runQa4d) {
          await log('QA4D-SKIPPED:qa=0')
          await log('TASK4D-DONE')
          return
        }
        ;(window as unknown as { __QA_ACCEPT_PATHS__?: string[] }).__QA_ACCEPT_PATHS__ = qaPaths4d
        await router.push('/qa')
        await sleep(2500)
        const qaParsed = (await window.api.qa.parse(qaPaths4d)) as {
          files: Array<{ name: string; count: number; error?: string }>
          records: Array<{ sessionId: string }>
          stats: { sessions: number; agents: string[] }
        }
        const sessionIds = [...new Set((qaParsed.records ?? []).map((r) => r.sessionId))]
        await log('QA4D-PARSE:' + JSON.stringify({
          files: qaParsed.files, total: (qaParsed.records ?? []).length,
          sessions: qaParsed.stats.sessions, agents: qaParsed.stats.agents.length, sessionIds
        }))
        await shot('135-4d-qa-import')
        const qaPrompt = (await window.api.qa.promptGet()) as { currentText: string; exists: boolean }
        await log('QA4D-PROMPT:' + JSON.stringify({ exists: qaPrompt.exists, promptLen: qaPrompt.currentText.length }))
        let qaChunks = 0
        let qaAcc = ''
        let qaDone: any = null
        let qaErr: any = null
        const offChunk4 = window.api.qa.onChunk((p) => { qaChunks += 1; qaAcc += p.delta })
        const offDone4 = window.api.qa.onDone((p) => { qaDone = p })
        const offErr4 = window.api.qa.onError((p) => { qaErr = p })
        const qaT0 = Date.now()
        const qaRes = (await window.api.qa.run({ paths: [...qaPaths4d], prompt: qaPrompt.currentText })) as { ok: boolean; message?: string; truncated?: boolean }
        await log('QA4D-RUN-RES:' + JSON.stringify(qaRes))
        while (!qaDone && !qaErr && Date.now() - qaT0 < 900000) {
          await sleep(1500)
        }
        const report = qaDone && qaDone.content ? qaDone.content : qaAcc
        const sidHits = sessionIds.filter((sid) => report.includes(sid)).length
        const hasSummary = report.includes('总结')
        await log('QA4D-STREAM:' + JSON.stringify({
          chunks: qaChunks, accLen: qaAcc.length, reportLen: report.length,
          done: !!qaDone, err: qaErr?.message ?? null, truncated: qaErr?.truncated ?? qaRes?.truncated ?? false,
          elapsedMs: Date.now() - qaT0, doneElapsedMs: qaDone?.elapsedMs ?? null,
          sessionsTotal: sessionIds.length, sessionsInReport: sidHits, hasSummary,
          tail: report.slice(-160)
        }))
        await shot('136-4d-qa-report')
        offChunk4(); offDone4(); offErr4()
        await log('TASK4D-DONE')
      } catch (e4d) {
        await log('TASK4D-ERR:' + String((e4d as Error)?.message ?? e4d))
      }
    }

    if (subMode === 'task9-gate' || subMode === 'task9-live' || subMode === 'task9-start') {
      // 任务 9 授权验收：真实机器码 + 未授权门禁 + 各拒绝状态 + 授权/万能解锁/14 天提醒
      const q9 = new URLSearchParams(window.location.search)
      const authSt = useAuthStore()
      const licPath = (key: string): string => {
        const v = q9.get(key)
        return v ? decodeURIComponent(v) : ''
      }
      const logAuth = async (tag: string, s: { state: { ok: boolean; reason: string; kind: string | null; expires: string | null; expiresInDays: number | null; expiringSoon: boolean }; machineCode: string }): Promise<void> => {
        await log(`TASK9-${tag}:` + JSON.stringify({ ok: s.state.ok, reason: s.state.reason, kind: s.state.kind, expires: s.state.expires, daysLeft: s.state.expiresInDays, expiringSoon: s.state.expiringSoon, machine: s.machineCode }))
      }
      await log('TASK9-GATE-PHASE-INIT:' + JSON.stringify({ loaded: authSt.loaded, ok: authSt.ok, phase: gatePhase(authSt.loaded, authSt.ok) }))
      await settings.load()
      await authSt.load()
      await log('TASK9-GATE-PHASE-AFTER:' + JSON.stringify({ loaded: authSt.loaded, ok: authSt.ok, phase: gatePhase(authSt.loaded, authSt.ok) }))
      await sleep(900)

      if (subMode === 'task9-gate') {
        // 取证①：真实机器码 + 未授权门禁页（本机尚无授权文件）
        const s = await window.api.auth.state()
        await logAuth('GATE-MACHINE', s)
        await shot('100-gate-no-license')
      }

      if (subMode === 'task9-live') {
        // 取证②：篡改文件 / 模拟换机 / 过期 / 正常授权 / 设置页机器码 / 14 天提醒 / 万能解锁
        const tampered = licPath('licTampered')
        if (tampered) {
          const r = await window.api.auth.importFile(tampered)
          await log('TASK9-IMPORT-TAMPERED:' + JSON.stringify({ ok: r.ok, reason: r.reason }))
          await authSt.load()
          await sleep(600)
          await shot('101-gate-tampered')
        }
        const expired = licPath('licExpired')
        if (expired) {
          const r = await window.api.auth.importFile(expired)
          await log('TASK9-IMPORT-EXPIRED:' + JSON.stringify({ ok: r.ok, reason: r.reason }))
          await authSt.load()
          await sleep(500)
          await shot('103-gate-expired')
        }
        // 正常授权：导入机器绑定授权文件 → 主界面
        const valid = licPath('licValid')
        if (valid) {
          const r = await window.api.auth.importFile(valid)
          await log('TASK9-IMPORT-VALID:' + JSON.stringify({ ok: r.ok, reason: r.reason }))
          await authSt.load()
          await sleep(1200)
          await shot('104-main-authorized')
          const s = await window.api.auth.state()
          await logAuth('AUTHORIZED', s)
          // 设置页：机器码显示 + 复制 + 授权状态
          await router.push('/settings')
          await sleep(1000)
          const copyBtn = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent ?? '').includes('复制机器码'))
          if (copyBtn) {
            copyBtn.click()
            await sleep(500)
          }
          const clip9 = await window.api.debug.clipboardRead()
          await log('TASK9-COPY-MACHINE-OK:' + authSt.message + ' clip-match=' + (clip9 === authSt.machineCode))
          await shot('105-settings-license')
        }
        // 模拟换机：授权绑定本机，另一台机器码 → 机器不匹配
        await window.api.debug.machineSimulate({ hard: 'f'.repeat(64), full: 'e'.repeat(64) })
        await authSt.load()
        await sleep(500)
        await shot('102-gate-mismatch')
        await window.api.debug.machineSimulate(null)
        await authSt.load()
        await sleep(400)
        // 14 天提醒：导入 10 天后到期授权 → 顶部提醒横幅（到期前不影响使用）
        const expiring = licPath('licExpiring')
        if (expiring) {
          const r = await window.api.auth.importFile(expiring)
          await log('TASK9-IMPORT-EXPIRING:' + JSON.stringify({ ok: r.ok, reason: r.reason }))
          await authSt.load()
          await router.push('/dashboard')
          await sleep(1000)
          await shot('106-banner-expiring')
        }
        // 万能解锁：清空授权回到锁定 → 导入万能解锁文件 → 立即解锁
        await window.api.debug.licenseReset()
        await authSt.load()
        await sleep(500)
        const unlock = licPath('licUnlock')
        if (unlock) {
          const r = await window.api.auth.importFile(unlock)
          await log('TASK9-IMPORT-UNLOCK:' + JSON.stringify({ ok: r.ok, reason: r.reason }))
          await authSt.load()
          await sleep(1200)
          await shot('107-unlock-active')
          const s = await window.api.auth.state()
          await logAuth('UNLOCK', s)
        }
        // 授权事件日志（解锁动作留痕）
        const logText = await window.api.debug.authLog()
        await log('TASK9-AUTH-EVENTS:' + logText.replace(/\n/g, ' || '))
      }

      if (subMode === 'task9-start') {
        // 取证③：已授权机器直接启动 → 进主界面
        const s = await window.api.auth.state()
        await logAuth('START-AUTHORIZED', s)
        await sleep(800)
        await shot('108-start-authorized')
      }

      await log('TASK9-UI-LIVE-DONE')
    }
    try {
      await window.api.window.close()
    } catch {
      // 关闭失败不影响截图结果
    }
    return
  }
  await settings.load()
  await sleep(1500)
  await shot('01-home-dark')

  for (const theme of ['light', 'high-contrast', 'dark'] as const) {
    await settings.setTheme(theme)
    await sleep(450)
    await shot(`02-theme-${theme}`)
  }

  const routes = router.getRoutes().filter((r) => r.name && r.meta?.title)
  for (const route of routes) {
    if (route.path === '/') continue
    await router.push(route.path)
    await sleep(450)
    await shot(`03-page-${String(route.name)}`)
  }

  dialog.info('导入完成', '共导入 31 天经营数据。\n可以在看板页查看趋势。')
  await sleep(450)
  await shot('04-dialog-info')
  dialog.close()

  dialog.confirm('删除这条导入记录？', '删除后该批数据将从本地移除。\n此操作不可撤销。', () => undefined)
  await sleep(450)
  await shot('05-dialog-confirm')
  dialog.close()


  // 任务 3 验收：导入中心 4 个 tab（数据导入/店铺管理/人工处理/模板下载）
  await router.push('/import')
  await sleep(600)
  const importTabs: Array<[string, string]> = [
    ['数据导入', '08-import-tab-import'],
    ['店铺管理', '09-import-tab-shop'],
    ['人工处理', '10-import-tab-fix'],
    ['模板下载', '11-import-tab-tpl']
  ]
  for (const [label, shotName] of importTabs) {
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.tab')].find((b) => (b.textContent ?? '').includes(label))
    btn?.click()
    await sleep(800)
    await shot(shotName)
  }
  dialog.error('文件解析失败', '这个文件格式不是生意参谋导出。\n请重新导出后再导入。')
  await sleep(450)
  await shot('06-dialog-error')
  dialog.close()

  await window.api.window.toggleMaximize()
  await sleep(700)
  await shot('07-window-maximized')
  await window.api.window.toggleMaximize()
  await sleep(500)

  // ========== 任务 4 验收：数据看板 9 区块 + 下钻 + 对比 + 月度目标 ==========
  await settings.setTheme('dark')
  await router.push('/dashboard')
  await sleep(1200)

  async function waitFor(sel: string, ms = 8000): Promise<boolean> {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (document.querySelector(sel)) return true
      await sleep(120)
    }
    return false
  }
  const root = (): HTMLElement | null => document.querySelector('.app-content')
  const scrollTo = (top: number): void => {
    root()?.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
  }

  // 顶部：窗口切换 + 摘要 + KPI（含覆盖标注与缺口提示）
  await waitFor('.kpi-card')
  scrollTo(0)
  await sleep(700)
  await shot('12-dashboard-top')

  // 经营趋势 + 表格
  const trendTop = (document.getElementById('sec-trend') as HTMLElement | null)?.offsetTop ?? 500
  scrollTo(Math.max(0, trendTop - 100))
  await sleep(800)
  await shot('13-dashboard-trend')

  // 单品：展开第一张卡（固定高度+内部滚动）
  const prodTop = (document.getElementById('sec-product') as HTMLElement | null)?.offsetTop ?? 1100
  scrollTo(Math.max(0, prodTop - 90))
  await sleep(700)
  ;(document.querySelector('.prod-head') as HTMLElement | null)?.click()
  await sleep(900)
  await shot('14-dashboard-product')

  // 推广
  const promoTop = (document.getElementById('sec-promo') as HTMLElement | null)?.offsetTop ?? 1600
  scrollTo(Math.max(0, promoTop - 90))
  await sleep(800)
  await shot('15-dashboard-promo')

  // 退款三档
  const refundTop = (document.getElementById('sec-refund') as HTMLElement | null)?.offsetTop ?? 2100
  scrollTo(Math.max(0, refundTop - 90))
  await sleep(800)
  await shot('16-dashboard-refund')

  // DSR + 客服
  const dsrTop = (document.getElementById('sec-dsr') as HTMLElement | null)?.offsetTop ?? 2600
  scrollTo(Math.max(0, dsrTop - 90))
  await sleep(800)
  await shot('17-dashboard-dsr-cs')

  // 搜索词
  const kwTop = (document.getElementById('sec-keywords') as HTMLElement | null)?.offsetTop ?? 3100
  scrollTo(Math.max(0, kwTop - 90))
  await sleep(800)
  await shot('18-dashboard-keywords')

  // 建议动作
  const actTop = (document.getElementById('sec-actions') as HTMLElement | null)?.offsetTop ?? 3600
  scrollTo(Math.max(0, actTop - 90))
  await sleep(800)
  await shot('19-dashboard-actions')

  // KPI 卡点击 → 指标趋势小图
  scrollTo(0)
  await sleep(500)
  ;(document.querySelector('.kpi-card') as HTMLElement | null)?.click()
  await sleep(900)
  await shot('20-dashboard-kpi-modal')
  ;(document.querySelector('.modal .x') as HTMLElement | null)?.click()
  await sleep(400)

  // 趋势点某天 → 当天明细
  scrollTo(Math.max(0, trendTop - 100))
  await sleep(500)
  ;(document.querySelector('.trend-table-wrap tbody tr') as HTMLElement | null)?.click()
  await sleep(900)
  await shot('21-dashboard-day-modal')
  ;(document.querySelector('.modal .x') as HTMLElement | null)?.click()
  await sleep(400)

  // 单品详情弹窗（展开区内按钮）
  scrollTo(Math.max(0, prodTop - 90))
  await sleep(500)
  ;(document.querySelector('.detail-btn') as HTMLElement | null)?.click()
  await sleep(900)
  await shot('22-dashboard-product-modal')
  ;(document.querySelector('.modal .x') as HTMLElement | null)?.click()
  await sleep(400)

  // 骨架屏（切换路由回来立即截）
  await router.push('/compare')
  await sleep(300)
  await router.push('/dashboard')
  await sleep(50)
  await shot('23-dashboard-skeleton')
  await sleep(1000)

  // 店铺对比（2 店已预置）
  await router.push('/compare')
  await sleep(1400)
  await shot('24-compare')

  // 设置页月度目标
  await router.push('/settings')
  await sleep(900)
  await shot('25-settings-target')

  // ========== 任务 4A 验收：商品图片绑定（上传/替换/下钻/全店列表/AB 不串图/删除/重启持久） ==========
  async function makePng(label: string, c1: string, c2: string): Promise<{ bytes: Uint8Array; name: string }> {
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 600
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 800, 600)
    g.addColorStop(0, c1)
    g.addColorStop(1, c2)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 800, 600)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 110px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, 400, 300)
    const b64 = c.toDataURL('image/png').split(',')[1]
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, name: label + '.png' }
  }
  // 上传商品图：优先模拟原生文件选择（input change，与真实用户路径一致）；
  // 若该路径未生效（Electron 下 DataTransfer 模拟不可靠），轮询确认后回退到 store.save（仍走真实 IPC：校验/缩放/落盘/落库/响应式刷新）
  async function uploadToBox(box: HTMLElement, bytes: Uint8Array, name: string, shopId: number, productId: string): Promise<string> {
    let viaInput = false
    const input = box.querySelector('input[type=file]') as HTMLInputElement | null
    if (input) {
      try {
        const dt = new DataTransfer()
        dt.items.add(new File([bytes as unknown as BlobPart], name, { type: 'image/png' }))
        input.files = dt.files
        const n = input.files.length
        const sz = n > 0 ? input.files[0].size : -1
        log('[4A] input sim files=' + n + ' size=' + sz)
        input.dispatchEvent(new Event('change', { bubbles: true }))
        viaInput = true
      } catch (err) {
        log('[4A] input sim error: ' + String(err))
      }
    }
    const t0 = Date.now()
    while (Date.now() - t0 < 2500) {
      const rows = (await window.api.productImages.list(shopId)) as Array<{ productId: string }>
      if (rows.some((r) => r.productId === productId)) {
        log('[4A] save landed via ' + (viaInput ? 'input' : 'direct') + ' (' + (Date.now() - t0) + 'ms)')
        await images.ensure(shopId)
        return viaInput ? 'input' : 'direct'
      }
      await sleep(150)
    }
    log('[4A] input path not landed, fallback to store.save')
    await images.save(shopId, productId, bytes, name)
    return 'direct'
  }
  const firstPimg = (): HTMLElement | null => document.querySelector('.prod-card .pimg')
  const firstProductId = (): string => (document.querySelector('.prod-card .prod-id') as HTMLElement | null)?.textContent?.trim() ?? ''
  const productTop = (): number => (document.getElementById('sec-product') as HTMLElement | null)?.offsetTop ?? 1100

  await router.push('/dashboard')
  await sleep(1300)
  await waitFor('.prod-card')
  scrollTo(Math.max(0, productTop() - 90))
  await sleep(900)

  const shopAImages = (await window.api.productImages.list(1)) as Array<{ productId: string }>
  const shopBImages = (await window.api.productImages.list(2)) as Array<{ productId: string }>

  if (shopAImages.length > 0) {
    // 第二次运行（重启后）：直接验证持久化
    await shot('26-pimg-after-restart-a')
    await shops.setDefault(2)
    await settings.selectShop('2')
    await sleep(1500)
    scrollTo(Math.max(0, productTop() - 90))
    await sleep(900)
    if (shopBImages.length > 0) {
      await shot('27-pimg-after-restart-b')
      const boxB = firstPimg()!
      boxB.dispatchEvent(new MouseEvent('mouseenter'))
      await sleep(400)
      ;(boxB.querySelector('.act.danger') as HTMLElement | null)?.click()
      await sleep(500)
      ;(document.querySelector('.dialog .btn-primary') as HTMLElement | null)?.click()
      await sleep(1200)
      await shot('28-pimg-restart-b-deleted')
    } else {
      await shot('27-pimg-after-restart-b-placeholder')
    }
    await shops.setDefault(1)
    await settings.selectShop('1')
    await sleep(1000)
  } else {
    // 首次运行：上传→替换→下钻→全店列表→店 B 绑定→不串图→删除
    const box = firstPimg()!
    const pidA = firstProductId()
    const imgA = await makePng('EC-AI SHOP-A', '#1db954', '#0b3d20')
    const path1 = await uploadToBox(box, imgA.bytes, imgA.name, 1, pidA)
    log('[4A] upload-A path=' + path1)
    await sleep(1200)
    await shot('26-pimg-uploaded')

    const imgA2 = await makePng('EC-AI REPLACED', '#4d9fff', '#123a6b')
    const path2 = await uploadToBox(box, imgA2.bytes, 'replaced.png', 1, pidA)
    log('[4A] replace-A path=' + path2)
    await sleep(1200)
    await shot('27-pimg-replaced')

    // 展开商品卡 → 点「在新弹窗查看单品详情」→ 截图 → 关闭
    const head = document.querySelector('.prod-card .prod-head') as HTMLElement | null
    head?.click()
    await sleep(1400)
    const dbBtn = document.querySelector('.detail-btn') as HTMLElement | null
    dbBtn?.click()
    await sleep(1200)
    await shot('28-pimg-product-modal')
    ;(document.querySelector('.modal .x') as HTMLElement | null)?.click()
    await sleep(400)

    await router.push('/store')
    await sleep(1300)
    await shot('29-pimg-store-list')

    // 店 B：同一商品 ID 绑另一张图
    await shops.setDefault(2)
    await settings.selectShop('2')
    await router.push('/dashboard')
    await sleep(1700)
    await waitFor('.prod-card')
    scrollTo(Math.max(0, productTop() - 90))
    await sleep(900)
    const boxB = firstPimg()!
    const pidB = firstProductId()
    const imgB = await makePng('EC-AI SHOP-B', '#f5a623', '#4d2b0b')
    const path3 = await uploadToBox(boxB, imgB.bytes, imgB.name, 2, pidB)
    log('[4A] upload-B path=' + path3)
    await sleep(1200)
    await shot('30-pimg-shop-b-bound')

    // 切回店 A：图仍是 A 的（不串图）
    await shops.setDefault(1)
    await settings.selectShop('1')
    await sleep(1700)
    scrollTo(Math.max(0, productTop() - 90))
    await sleep(900)
    await shot('31-pimg-shop-a-still-a')

    // 删除店 B 图片
    await shops.setDefault(2)
    await settings.selectShop('2')
    await sleep(1700)
    scrollTo(Math.max(0, productTop() - 90))
    await sleep(900)
    const boxB2 = firstPimg()!
    boxB2.dispatchEvent(new MouseEvent('mouseenter'))
    await sleep(400)
    ;(boxB2.querySelector('.act.danger') as HTMLElement | null)?.click()
    await sleep(500)
    ;(document.querySelector('.dialog .btn-primary') as HTMLElement | null)?.click()
    await sleep(1300)
    await shot('32-pimg-shop-b-deleted')
    await shops.setDefault(1)
    await settings.selectShop('1')
    await sleep(800)
  }

  // 无联网检查：商品图全部走 ecai-img:// 本地协议，0 个 http(s) 资源
  const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const external = res.filter((r) => /^https?:/.test(r.name))
  console.log('[4A] resource entries:', res.length, 'external:', external.length, external.map((e) => e.name).join('|'))

  // 回到默认主题，停在数据看板
  await settings.setTheme('dark')
  await router.push('/dashboard')
  await sleep(500)

  // ========== 任务 5 验收：模型配置 + 技能管理 ==========
  const btnByText = (sel: string, text: string): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>(sel)].find((b) => (b.textContent ?? '').includes(text)) ?? null

  await settings.setTheme('dark')
  await router.push('/settings')
  await sleep(1000)
  await waitFor('.model-list, .empty')
  await shot('33-settings-models')

  // 添加模型：选 Ollama 本地预设（无需 key），保存后列表出现
  btnByText('button', '添加模型')?.click()
  await sleep(500)
  await shot('34-models-add-modal')
  const presetSel = document.querySelector<HTMLSelectElement>('.modal select')
  if (presetSel) {
    presetSel.value = 'ollama'
    presetSel.dispatchEvent(new Event('change'))
    await sleep(300)
  }
  document.querySelector<HTMLElement>('.modal .btn-primary')?.click()
  await sleep(900)
  await shot('35-models-created')

  // 技能管理：已安装（内置）→ GitHub 解析 → 安装 → 绑定 → 编辑校验
  await router.push('/skills')
  await sleep(900)
  await waitFor('.skill-row')
  await shot('36-skills-installed')

  btnByText('.tab', '从 GitHub 安装')?.click()
  await sleep(400)
  const linkInput = document.querySelector<HTMLInputElement>('.install-panel .input')
  if (linkInput) {
    linkInput.value = 'https://github.com/anthropics/skills'
    linkInput.dispatchEvent(new Event('input'))
    btnByText('button', '解析')?.click()
  }
  await waitFor('.cand-item', 40000)
  await sleep(600)
  await shot('37-skills-github-parse')
  btnByText('button', '安装所选')?.click()
  // 等安装完成弹窗出现并点掉，再等已安装列表出现 GitHub 技能后截图
  const installT0 = Date.now()
  let infoClicked = false
  while (Date.now() - installT0 < 30000) {
    const info = btnByText('button', '知道了') ?? btnByText('button', '确定')
    if (info && !infoClicked) {
      info.click()
      infoClicked = true
    }
    if (infoClicked && !info) break
    await sleep(200)
  }
  btnByText('.tab', '已安装技能')?.click()
  const listT0 = Date.now()
  while (Date.now() - listT0 < 20000) {
    const skillRows = [...document.querySelectorAll<HTMLElement>('.skill-row')]
    if (skillRows.some((r) => /algorithmic-art/i.test(r.textContent ?? ''))) break
    await sleep(200)
  }
  await sleep(500)
  await shot('38-skills-installed-after')

  btnByText('.tab', '模块绑定')?.click()
  await sleep(500)
  await shot('39-skills-binding')

  // 编辑提示词：改一行 → 保存 → 重新打开验证一致
  btnByText('.tab', '已安装技能')?.click()
  await sleep(500)
  document.querySelector<HTMLElement>('.skill-row .icon-btn')?.click()
  await sleep(600)
  const code = document.querySelector<HTMLTextAreaElement>('.modal .code')
  const marker = '\n# 验收追加行：编辑后重开一致'
  if (code) {
    code.value = code.value + marker
    code.dispatchEvent(new Event('input'))
    await sleep(200)
  }
  document.querySelector<HTMLElement>('.modal .btn-primary')?.click()
  await sleep(800)
  const closeBtn = btnByText('button', '知道了') ?? btnByText('button', '确定')
  closeBtn?.click()
  await sleep(400)
  document.querySelector<HTMLElement>('.skill-row .icon-btn')?.click()
  await sleep(600)
  const code2 = document.querySelector<HTMLTextAreaElement>('.modal .code')
  await log('TASK5-EDIT-REOPEN:' + (code2 && code2.value.includes('# 验收追加行') ? 'CONSISTENT' : 'MISMATCH'))
  await shot('40-skills-edit-verify')
  const close2 = btnByText('button', '取消') ?? document.querySelector<HTMLElement>('.modal .x')
  close2?.click()
  await sleep(400)

  // 验收模式自动收尾：跑完截图后关闭窗口（触发 app 退出）
  await sleep(300)
  try {
    await window.api.window.close()
  } catch {
    // 关闭失败不影响截图结果
  }
}
