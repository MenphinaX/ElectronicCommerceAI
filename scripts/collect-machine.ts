// 任务 9 验收辅助：打印本机真实机器码（与主应用 collectMachineId 同一代码路径）
import { collectMachineId } from '../src/main/auth/machine'

const m = await collectMachineId()
console.log('MACHINE_HARD=' + m.hard)
console.log('MACHINE_FULL=' + m.full)
console.log('MACHINE_CODE=' + m.display)