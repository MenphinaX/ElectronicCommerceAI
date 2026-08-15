import { contextBridge, ipcRenderer, webUtils } from 'electron'

// 渲染层唯一入口：窗口控制 / 设置读写 / 验收截图
const api = {
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, maximized: boolean): void => cb(maximized)
      ipcRenderer.on('window:maximized-changed', listener)
      return () => ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  },
  auth: {
    state: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('auth:state'),
    pickFile: (): Promise<{ ok: boolean; filePath: string | null }> => ipcRenderer.invoke('auth:pick-file'),
    importFile: (filePath: string): Promise<Record<string, unknown>> => ipcRenderer.invoke('auth:import', filePath),
    copy: (text: string): Promise<boolean> => ipcRenderer.invoke('auth:copy', text)
  },
  settings: {
    get: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('settings:get'),
    set: (patch: Record<string, unknown>): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('settings:set', patch)
  },
  db: {
    status: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('db:status'),
    backup: (reason?: string): Promise<{ path: string }> => ipcRenderer.invoke('db:backup', reason),
    restore: (backupPath: string): Promise<{ ok: boolean; integrity: string }> => ipcRenderer.invoke('db:restore', backupPath),
    integrity: (): Promise<string> => ipcRenderer.invoke('db:integrity'),
    listBackups: (): Promise<string[]> => ipcRenderer.invoke('db:list-backups')
  },
  app: {
    info: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('app:info')
  },
  profile: {
    get: (): Promise<{ username: string; avatar: string }> => ipcRenderer.invoke('profile:get'),
    set: (profile: { username: string; avatar: string }): Promise<{ username: string; avatar: string }> =>
      ipcRenderer.invoke('profile:set', profile),
    pickAvatar: (): Promise<{ ok: boolean; avatar?: string; error?: string }> => ipcRenderer.invoke('profile:pick-avatar')
  },
  theme: {
    pickBackground: (): Promise<{ ok: boolean; file?: string; error?: string }> => ipcRenderer.invoke('theme:pick-background'),
    removeBackground: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('theme:remove-background')
  },
  system: {
    passwordStatus: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('system:password-status'),
    passwordSet: (pwd: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('system:password-set', pwd),
    passwordClear: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('system:password-clear'),
    passwordVerify: (pwd: string): Promise<{ ok: boolean; reason: string }> => ipcRenderer.invoke('system:password-verify', pwd),
    vacuum: (): Promise<{ ok: boolean; before: number; after: number }> => ipcRenderer.invoke('system:vacuum'),
    dbSize: (): Promise<{ bytes: number }> => ipcRenderer.invoke('system:db-size'),
    logs: (): Promise<{ lines: string[]; error?: string }> => ipcRenderer.invoke('system:logs'),
    openPath: (target: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('system:open-path', target),
    pickFile: (opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<{ ok: boolean; filePath?: string | null }> =>
      ipcRenderer.invoke('system:pick-file', opts),
    openExternal: (url: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('system:open-external', url),
    diagnostics: (): Promise<{ ok: boolean; path?: string; error?: string }> => ipcRenderer.invoke('system:diagnostics'),
    copy: (text: string): Promise<boolean> => ipcRenderer.invoke('system:copy', text),
    now: (): Promise<{ dateStr: string; hour: number }> => ipcRenderer.invoke('system:now')
  },
  updater: {
    check: (): Promise<boolean> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<boolean> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<boolean> => ipcRenderer.invoke('updater:install'),
    feed: (): Promise<{ feed: string; repo: string }> => ipcRenderer.invoke('updater:feed'),
    onEvent: (cb: (payload: Record<string, unknown>) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: Record<string, unknown>): void => cb(payload)
      ipcRenderer.on('updater:event', listener)
      return () => ipcRenderer.removeListener('updater:event', listener)
    }
  },

  shops: {
    list: (): Promise<{ shops: Array<Record<string, unknown>>; defaultId: number | null }> => ipcRenderer.invoke('shops:list'),
    create: (row: { name: string; platform?: string; shopCode?: string | null }): Promise<number> => ipcRenderer.invoke('shops:create', row),
    update: (id: number, patch: { name?: string; platform?: string; shopCode?: string | null }): Promise<boolean> => ipcRenderer.invoke('shops:update', id, patch),
    remove: (id: number): Promise<boolean> => ipcRenderer.invoke('shops:delete', id),
    setDefault: (id: number | null): Promise<boolean> => ipcRenderer.invoke('shops:set-default', id)
  },
  importData: {
    pick: (): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('import:pick'),
    analyze: (paths: string[]): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('import:analyze', paths),
    run: (opts: { paths: string[]; shopId: number; allowFallback?: boolean }): Promise<Array<Record<string, unknown>>> =>
      ipcRenderer.invoke('import:run', opts),
    history: (): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('import:history'),
    deleteHistory: (id: number): Promise<boolean> => ipcRenderer.invoke('import:delete-history', id),
    failedList: (): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('import:failed-list'),
    manualPreview: (importId: number): Promise<Record<string, unknown>> => ipcRenderer.invoke('import:manual-preview', importId),
    manualParsePreview: (opts: { importId: number; type?: string; headerRow: number; mapping?: Record<string, string> }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('import:manual-parse-preview', opts),
    manualMap: (opts: { importId: number; type?: string; headerRow: number; mapping: Record<string, string> }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('import:manual-map', opts),
    manualSubmit: (opts: { importId: number; records: Array<Record<string, unknown>>; method: string; reason: string; type?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('import:manual-submit', opts),
    manualEntry: (opts: { shopId: number; type: string; sourceName: string; records: Array<Record<string, unknown>>; reason: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('import:manual-entry', opts),
    llmStatus: (): Promise<{ configured: boolean; baseUrl: string | null; model: string | null }> => ipcRenderer.invoke('import:llm-status'),
    llmConfigGet: (): Promise<{ baseUrl: string | null; model: string | null; keySet: boolean }> => ipcRenderer.invoke('import:llm-config-get'),
    llmConfigSet: (cfg: { baseUrl: string; model: string; apiKey: string }): Promise<{ ok: boolean }> => ipcRenderer.invoke('import:llm-config-set', cfg),
    templates: (): Promise<{ dir: string; items: Array<Record<string, unknown>> }> => ipcRenderer.invoke('import:templates'),
    templatesSaveTo: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('import:templates-save'),
    templatesOpen: (): Promise<{ dir: string }> => ipcRenderer.invoke('import:templates-open')
  },
  webUtils: {
    getPathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },
  dashboard: {
    get: (opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('dashboard:get', opts),
    dayDetail: (opts: { shopId: number; date: string }): Promise<Record<string, unknown>> => ipcRenderer.invoke('dashboard:day-detail', opts),
    productDetail: (opts: { shopId: number; productId: string; from: string; to: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('dashboard:product-detail', opts),
    compare: (opts: { shopIds: number[]; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('dashboard:compare', opts)
  },
  productImages: {
    save: (opts: { shopId: number; productId: string; bytes: Uint8Array; origName: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('productImages:save', opts),
    list: (shopId: number): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('productImages:list', shopId),
    remove: (opts: { shopId: number; productId: string }): Promise<{ ok: boolean }> => ipcRenderer.invoke('productImages:delete', opts),
    dir: (): Promise<string> => ipcRenderer.invoke('productImages:dir')
  },
  setting: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('setting:get', key),
    set: (key: string, value: string): Promise<string | null> => ipcRenderer.invoke('setting:set', key, value)
  },
  models: {
    list: (): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('models:list'),
    create: (row: { name: string; provider?: string; baseUrl: string; apiKey?: string }): Promise<number> =>
      ipcRenderer.invoke('models:create', row),
    update: (id: number, patch: { name?: string; provider?: string; baseUrl?: string; apiKey?: string; enabled?: boolean }): Promise<boolean> =>
      ipcRenderer.invoke('models:update', id, patch),
    remove: (id: number): Promise<boolean> => ipcRenderer.invoke('models:delete', id),
    setDefault: (id: number | null): Promise<boolean> => ipcRenderer.invoke('models:set-default', id),
    getDefault: (): Promise<number | null> => ipcRenderer.invoke('models:get-default'),
    test: (id: number): Promise<{ ok: boolean; elapsedMs: number; message?: string; note?: string; model?: string }> =>
      ipcRenderer.invoke('models:test', id),
    fetchModels: (input: { baseUrl: string; apiKey: string; provider?: string }): Promise<{ ok: boolean; models?: string[]; error?: string }> =>
      ipcRenderer.invoke('models:fetch-list', input)
  },
  skills: {
    list: (): Promise<{ skills: Array<Record<string, unknown>>; bindings: Array<Record<string, unknown>>; modules: string[] }> =>
      ipcRenderer.invoke('skills:list'),
    parse: (input: string): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('skills:parse', input),
    parseCancel: (): Promise<boolean> => ipcRenderer.invoke('skills:parse-cancel'),
    install: (candidates: Array<{ name: string; description?: string; content: string }>): Promise<Array<Record<string, unknown>>> =>
      ipcRenderer.invoke('skills:install', candidates),
    read: (id: number): Promise<{ name: string; description: string; content: string }> => ipcRenderer.invoke('skills:read', id),
    save: (id: number, content: string): Promise<Record<string, unknown>> => ipcRenderer.invoke('skills:save', id, content),
    remove: (id: number): Promise<boolean> => ipcRenderer.invoke('skills:delete', id),
    setBinding: (module: string, skillId: number | null): Promise<boolean> => ipcRenderer.invoke('skills:set-binding', module, skillId)
  },
  comments: {
    list: (opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('comments:list', opts),
    auto: (opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('comments:auto', opts),
    regenerate: (opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('comments:regenerate', opts),
    regenerateModule: (opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string; module: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('comments:regenerate-module', opts)
  },
  chat: {
    conversations: (opts?: { shopId?: number | null }): Promise<Array<Record<string, unknown>>> =>
      ipcRenderer.invoke('chat:conversations', opts ?? {}),
    create: (opts: { shopId?: number | null; title?: string | null }): Promise<{ id: number }> =>
      ipcRenderer.invoke('chat:create', opts),
    rename: (opts: { id: number; title: string }): Promise<boolean> => ipcRenderer.invoke('chat:rename', opts),
    remove: (opts: { id: number }): Promise<boolean> => ipcRenderer.invoke('chat:delete', opts),
    messages: (opts: { conversationId: number }): Promise<Array<Record<string, unknown>>> =>
      ipcRenderer.invoke('chat:messages', opts),
    send: (opts: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> =>
      ipcRenderer.invoke('chat:send', opts),
    onStart: (cb: (payload: { conversationId: number }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { conversationId: number }): void => cb(payload)
      ipcRenderer.on('chat:start', listener)
      return () => ipcRenderer.removeListener('chat:start', listener)
    },
    onChunk: (cb: (payload: { conversationId: number; delta: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { conversationId: number; delta: string }): void => cb(payload)
      ipcRenderer.on('chat:chunk', listener)
      return () => ipcRenderer.removeListener('chat:chunk', listener)
    },
    onDone: (cb: (payload: { conversationId: number; messageId: number; content: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { conversationId: number; messageId: number; content: string }): void => cb(payload)
      ipcRenderer.on('chat:done', listener)
      return () => ipcRenderer.removeListener('chat:done', listener)
    },
    onError: (cb: (payload: { conversationId: number; message: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { conversationId: number; message: string }): void => cb(payload)
      ipcRenderer.on('chat:error', listener)
      return () => ipcRenderer.removeListener('chat:error', listener)
    }
  },
  qa: {
    parse: (paths: string[]): Promise<Record<string, unknown>> => ipcRenderer.invoke('qa:parse', paths),
    promptGet: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('qa:prompt-get'),
    promptSet: (text: string): Promise<boolean> => ipcRenderer.invoke('qa:prompt-set', text),
    promptReset: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('qa:prompt-reset'),
    history: (): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('qa:history'),
    run: (opts: { paths: string[]; prompt: string }): Promise<{ ok: boolean; message?: string }> =>
      ipcRenderer.invoke('qa:run', opts),
    onChunk: (cb: (payload: { delta: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { delta: string }): void => cb(payload)
      ipcRenderer.on('qa:chunk', listener)
      return () => ipcRenderer.removeListener('qa:chunk', listener)
    },
    onDone: (cb: (payload: { content: string; stats: Record<string, unknown>; elapsedMs: number; truncated?: boolean }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { content: string; stats: Record<string, unknown>; elapsedMs: number }): void => cb(payload)
      ipcRenderer.on('qa:done', listener)
      return () => ipcRenderer.removeListener('qa:done', listener)
    },
    onError: (cb: (payload: { message: string; truncated?: boolean }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { message: string; truncated?: boolean }): void => cb(payload)
      ipcRenderer.on('qa:error', listener)
      return () => ipcRenderer.removeListener('qa:error', listener)
    },
    onNotice: (cb: (payload: { message: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { message: string }): void => cb(payload)
      ipcRenderer.on('qa:notice', listener)
      return () => ipcRenderer.removeListener('qa:notice', listener)
    }
  },
  roi: {
    windowData: (opts: { shopId: number; mode: '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown> | null> =>
      ipcRenderer.invoke('roi:window-data', opts),
    save: (row: { name: string; paramsJson: string; resultJson: string; passed: boolean }): Promise<{ id: number }> =>
      ipcRenderer.invoke('roi:save', row),
    list: (): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('roi:list'),
    remove: (id: number): Promise<boolean> => ipcRenderer.invoke('roi:delete', id),
    advice: (input: Record<string, unknown>): Promise<{ ok: boolean; configured: boolean; skillName?: string | null; content?: string | null; error?: string | null }> =>
      ipcRenderer.invoke('roi:advice', input)
  },
  report: {
    export: (opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; type?: 'daily' | 'weekly'; today?: string; targetDir?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('report:export', opts),
    exportPdf: (opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; type?: 'daily' | 'weekly'; today?: string; targetDir?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('report:export-pdf', opts),
    exportDetail: (opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; kind: 'refund' | 'product' | 'daily'; format?: 'xlsx' | 'csv'; today?: string; targetDir?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('report:export-detail', opts),
    list: (): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('report:list'),
    pickDir: (): Promise<{ ok: boolean; dir?: string }> => ipcRenderer.invoke('report:pick-dir')
  },
  dataPackage: {
    export: (opts: { shopId: number; dateStart?: string | null; dateEnd?: string | null; password?: string | null; targetPath?: string }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('package:export', opts),
    import: (opts: { filePath: string; password?: string | null }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('package:import', opts),
    pickFile: (): Promise<{ ok: boolean; filePath?: string }> => ipcRenderer.invoke('package:pick-file'),
    inspect: (opts: { filePath: string; password?: string | null }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('package:inspect', opts)
  },
  files: {
    read: (paths: string[]): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('files:read', paths)
  },
  data: {
    templates: (): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('data:templates'),
    query: (opts: { templateId: string; params: Record<string, unknown> }): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('data:query', opts)
  },
  debug: {
    shot: (name: string, rect?: { x: number; y: number; width: number; height: number }): Promise<boolean> => ipcRenderer.invoke('debug:shot', name, rect),
    machineSimulate: (m: { hard: string; full: string } | null): Promise<boolean> => ipcRenderer.invoke('debug:machine-simulate', m),
    licenseReset: (): Promise<boolean> => ipcRenderer.invoke('debug:license-reset'),
    authLog: (): Promise<string> => ipcRenderer.invoke('debug:auth-log'),
    clipboardRead: (): Promise<string> => ipcRenderer.invoke('debug:clipboard-read'),
    log: (line: string): Promise<boolean> => ipcRenderer.invoke('debug:log', line),
    modelSetup: (): Promise<{ ok: boolean; id?: number; model?: string; message?: string }> => ipcRenderer.invoke('debug:model-setup'),
    renderHtmlShot: (filePath: string, shotName: string): Promise<boolean> => ipcRenderer.invoke('debug:render-html-shot', filePath, shotName),
    avatarFromPath: (srcPath: string): Promise<{ ok: boolean; avatar?: string; error?: string; width?: number; height?: number; processed?: boolean }> => ipcRenderer.invoke('debug:avatar-from-path', srcPath)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api