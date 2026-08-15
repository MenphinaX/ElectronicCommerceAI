// 任务 4H 门禁三态纯函数：pending（校验中，只显示品牌图标+加载动画）/ ok（放行）/ denied（真未授权才显示 LicenseGate）
export type GatePhase = 'pending' | 'ok' | 'denied'

export function gatePhase(loaded: boolean, ok: boolean): GatePhase {
  if (!loaded) return 'pending'
  return ok ? 'ok' : 'denied'
}
