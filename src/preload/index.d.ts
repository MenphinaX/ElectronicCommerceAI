// 渲染层 window.api 类型声明（与 preload/index.ts 保持同构）
export type LicenseReason = 'ok' | 'no-license' | 'corrupt' | 'invalid-signature' | 'machine-mismatch' | 'expired'

export interface LicenseState {
  ok: boolean
  reason: LicenseReason
  kind: 'machine' | 'unlock' | null
  machine: string
  expires: string | null
  issuedAt: string | null
  issuer: string | null
  purpose: string | null
  expiresInDays: number | null
  expiringSoon: boolean
}

export interface AuthSnapshot {
  state: LicenseState
  machineCode: string
  hardId: string
  fingerprint: string
}
export interface PreloadApi {
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaximizedChange(cb: (maximized: boolean) => void): () => void
  }
  auth: {
    state(): Promise<AuthSnapshot>
    pickFile(): Promise<{ ok: boolean; filePath: string | null }>
    importFile(filePath: string): Promise<{ ok: boolean; reason?: string; message?: string; state?: LicenseState }>
    copy(text: string): Promise<boolean>
  }
  settings: {
    get(): Promise<Record<string, unknown>>
    set(patch: Record<string, unknown>): Promise<Record<string, unknown>>
  }
  db: {
    status(): Promise<Record<string, unknown>>
    backup(reason?: string): Promise<{ path: string }>
    restore(backupPath: string): Promise<{ ok: boolean; integrity: string }>
    integrity(): Promise<string>
    listBackups(): Promise<string[]>
  }
  shops: {
    list(): Promise<{ shops: Array<Record<string, unknown>>; defaultId: number | null }>
    create(row: { name: string; platform?: string; shopCode?: string | null }): Promise<number>
    update(id: number, patch: { name?: string; platform?: string; shopCode?: string | null }): Promise<boolean>
    remove(id: number): Promise<boolean>
    setDefault(id: number | null): Promise<boolean>
  }
  importData: {
    pick(): Promise<Array<Record<string, unknown>>>
    analyze(paths: string[]): Promise<Array<Record<string, unknown>>>
    run(opts: { paths: string[]; shopId: number; allowFallback?: boolean }): Promise<Array<Record<string, unknown>>>
    history(): Promise<Array<Record<string, unknown>>>
    deleteHistory(id: number): Promise<boolean>
    failedList(): Promise<Array<Record<string, unknown>>>
    manualPreview(importId: number): Promise<Record<string, unknown>>
    manualParsePreview(opts: { importId: number; type?: string; headerRow: number; mapping?: Record<string, string> }): Promise<Record<string, unknown>>
    manualMap(opts: { importId: number; type?: string; headerRow: number; mapping: Record<string, string> }): Promise<Record<string, unknown>>
    manualSubmit(opts: { importId: number; records: Array<Record<string, unknown>>; method: string; reason: string; type?: string }): Promise<Record<string, unknown>>
    manualEntry(opts: { shopId: number; type: string; sourceName: string; records: Array<Record<string, unknown>>; reason: string }): Promise<Record<string, unknown>>
    llmStatus(): Promise<{ configured: boolean; baseUrl: string | null; model: string | null }>
    llmConfigGet(): Promise<{ baseUrl: string | null; model: string | null; keySet: boolean }>
    llmConfigSet(cfg: { baseUrl: string; model: string; apiKey: string }): Promise<{ ok: boolean }>
    templates(): Promise<{ dir: string; items: Array<Record<string, unknown>> }>
    templatesSaveTo(): Promise<Record<string, unknown>>
    templatesOpen(): Promise<{ dir: string }>
  }
  webUtils: {
    getPathForFile(file: File): string
  }
  dashboard: {
    get(opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>>
    dayDetail(opts: { shopId: number; date: string }): Promise<Record<string, unknown>>
    productDetail(opts: { shopId: number; productId: string; from: string; to: string }): Promise<Record<string, unknown>>
    compare(opts: { shopIds: number[]; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>>
  }
  productImages: {
    save(opts: { shopId: number; productId: string; bytes: Uint8Array; origName: string }): Promise<Record<string, unknown>>
    list(shopId: number): Promise<Array<Record<string, unknown>>>
    remove(opts: { shopId: number; productId: string }): Promise<{ ok: boolean }>
    dir(): Promise<string>
  }
  setting: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<string | null>
  }
  models: {
    list(): Promise<Array<Record<string, unknown>>>
    create(row: { name: string; provider?: string; baseUrl: string; apiKey?: string }): Promise<number>
    update(id: number, patch: { name?: string; provider?: string; baseUrl?: string; apiKey?: string; enabled?: boolean }): Promise<boolean>
    remove(id: number): Promise<boolean>
    setDefault(id: number | null): Promise<boolean>
    getDefault(): Promise<number | null>
    test(id: number): Promise<{ ok: boolean; elapsedMs: number; message?: string; note?: string; model?: string }>
    fetchModels(input: { baseUrl: string; apiKey: string; provider?: string }): Promise<{ ok: boolean; models?: string[]; error?: string }>
  }
  skills: {
    list(): Promise<{ skills: Array<Record<string, unknown>>; bindings: Array<Record<string, unknown>>; modules: string[] }>
    parse(input: string): Promise<Array<Record<string, unknown>>>
    parseCancel(): Promise<boolean>
    install(candidates: Array<{ name: string; description?: string; content: string }>): Promise<Array<Record<string, unknown>>>
    read(id: number): Promise<{ name: string; description: string; content: string }>
    save(id: number, content: string): Promise<Record<string, unknown>>
    remove(id: number): Promise<boolean>
    setBinding(module: string, skillId: number | null): Promise<boolean>
  }
    comments: {
    list(opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>>
    auto(opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>>
    regenerate(opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown>>
    regenerateModule(opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; today?: string; module: string }): Promise<Record<string, unknown>>
  }
    chat: {
    conversations(opts?: { shopId?: number | null }): Promise<Array<Record<string, unknown>>>
    create(opts: { shopId?: number | null; title?: string | null }): Promise<{ id: number }>
    rename(opts: { id: number; title: string }): Promise<boolean>
    remove(opts: { id: number }): Promise<boolean>
    messages(opts: { conversationId: number }): Promise<Array<Record<string, unknown>>>
    send(opts: Record<string, unknown>): Promise<{ ok: boolean; message?: string }>
    onStart(cb: (payload: { conversationId: number }) => void): () => void
    onChunk(cb: (payload: { conversationId: number; delta: string }) => void): () => void
    onDone(cb: (payload: { conversationId: number; messageId: number; content: string }) => void): () => void
    onError(cb: (payload: { conversationId: number; message: string }) => void): () => void
  }
  qa: {
    parse(paths: string[]): Promise<Record<string, unknown>>
    promptGet(): Promise<Record<string, unknown>>
    promptSet(text: string): Promise<boolean>
    promptReset(): Promise<Record<string, unknown>>
    history(): Promise<Array<Record<string, unknown>>>
    run(opts: { paths: string[]; prompt: string }): Promise<{ ok: boolean; message?: string }>
    onChunk(cb: (payload: { delta: string }) => void): () => void
    onDone(cb: (payload: { content: string; stats: Record<string, unknown>; elapsedMs: number; truncated?: boolean }) => void): () => void
    onError(cb: (payload: { message: string; truncated?: boolean }) => void): () => void
    onNotice(cb: (payload: { message: string }) => void): () => void
  }
  roi: {
    windowData(opts: { shopId: number; mode: '7' | '15' | '30'; today?: string }): Promise<Record<string, unknown> | null>
    save(row: { name: string; paramsJson: string; resultJson: string; passed: boolean }): Promise<{ id: number }>
    list(): Promise<Array<Record<string, unknown>>>
    remove(id: number): Promise<boolean>
    advice(input: Record<string, unknown>): Promise<{ ok: boolean; configured: boolean; skillName?: string | null; content?: string | null; error?: string | null }>
  }
  report: {
    export(opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; type?: 'daily' | 'weekly'; today?: string; targetDir?: string }): Promise<Record<string, unknown>>
    exportPdf(opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; type?: 'daily' | 'weekly'; today?: string; targetDir?: string }): Promise<Record<string, unknown>>
    exportDetail(opts: { shopId: number; mode: 'yesterday' | '7' | '15' | '30'; kind: 'refund' | 'product' | 'daily'; format?: 'xlsx' | 'csv'; today?: string; targetDir?: string }): Promise<Record<string, unknown>>
    list(): Promise<Array<Record<string, unknown>>>
    pickDir(): Promise<{ ok: boolean; dir?: string }>
  }
  dataPackage: {
    export(opts: { shopId: number; dateStart?: string | null; dateEnd?: string | null; password?: string | null; targetPath?: string }): Promise<Record<string, unknown>>
    import(opts: { filePath: string; password?: string | null }): Promise<Record<string, unknown>>
    pickFile(): Promise<{ ok: boolean; filePath?: string }>
    inspect(opts: { filePath: string; password?: string | null }): Promise<Record<string, unknown>>
  }
  files: {
    read(paths: string[]): Promise<Array<Record<string, unknown>>>
  }
  data: {
    templates(): Promise<Array<Record<string, unknown>>>
    query(opts: { templateId: string; params: Record<string, unknown> }): Promise<Record<string, unknown>>
  }
  app: {
    info(): Promise<Record<string, unknown>>
  }
  profile: {
    get(): Promise<{ username: string; avatar: string }>
    set(profile: { username: string; avatar: string }): Promise<{ username: string; avatar: string }>
    pickAvatar(): Promise<{ ok: boolean; avatar?: string; error?: string }>
  }
  theme: {
    pickBackground(): Promise<{ ok: boolean; file?: string; error?: string }>
    removeBackground(): Promise<{ ok: boolean }>
  }
  system: {
    passwordStatus(): Promise<{ enabled: boolean }>
    passwordSet(pwd: string): Promise<{ ok: boolean; message?: string }>
    passwordClear(): Promise<{ ok: boolean }>
    passwordVerify(pwd: string): Promise<{ ok: boolean; reason: string }>
    vacuum(): Promise<{ ok: boolean; before: number; after: number }>
    dbSize(): Promise<{ bytes: number }>
    logs(): Promise<{ lines: string[]; error?: string }>
    openPath(target: string): Promise<{ ok: boolean; error?: string }>
    pickFile(opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<{ ok: boolean; filePath?: string | null }>
    openExternal(url: string): Promise<{ ok: boolean; error?: string }>
    diagnostics(): Promise<{ ok: boolean; path?: string; error?: string }>
    copy(text: string): Promise<boolean>
    now(): Promise<{ dateStr: string; hour: number }>
  }
  updater: {
    check(): Promise<boolean>
    download(): Promise<boolean>
    install(): Promise<boolean>
    feed(): Promise<{ feed: string; repo: string; source?: string }>
    onEvent(cb: (payload: Record<string, unknown>) => void): () => void
  }
  debug: {
    shot(name: string, rect?: { x: number; y: number; width: number; height: number }): Promise<boolean>
    machineSimulate(m: { hard: string; full: string } | null): Promise<boolean>
    licenseReset(): Promise<boolean>
    authLog(): Promise<string>
    clipboardRead(): Promise<string>
    log(line: string): Promise<boolean>
    modelSetup(): Promise<{ ok: boolean; id?: number; model?: string; message?: string }>
    renderHtmlShot(filePath: string, shotName: string): Promise<boolean>
    avatarFromPath(srcPath: string): Promise<{ ok: boolean; avatar?: string; error?: string; width?: number; height?: number; processed?: boolean }>
  }
}

declare global {
  interface Window {
    api: PreloadApi
  }
}

export {}