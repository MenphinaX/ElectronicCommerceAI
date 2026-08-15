// 任务 4H：模型服务商预设（设置页模型管理 + 启动向导「配置 AI 模型」步骤共用同一份）
export interface ModelPreset {
  id: string
  label: string
  baseUrl: string
  model: string
}

export const MODEL_PRESETS: ModelPreset[] = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'kimi', label: 'Kimi 月之暗面', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
  { id: 'ollama', label: 'Ollama 本地', baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.1' }
]

export function modelPresetLabel(id: string): string {
  return MODEL_PRESETS.find((p) => p.id === id)?.label ?? (id === 'openai-compatible' ? '通用 OpenAI 兼容' : id)
}
