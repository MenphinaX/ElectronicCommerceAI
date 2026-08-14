// 建库脚本：幂等建库（连续跑两次验收）。默认 EC_AI_DB_PATH，否则 <项目>/data/ecai.db
import { resolve } from 'node:path'
import { AppDatabase } from '../src/main/db'

const dbPath = process.env.EC_AI_DB_PATH ? resolve(process.env.EC_AI_DB_PATH) : resolve(process.cwd(), 'data', 'ecai.db')

function initOnce(p: string): { version: number; integrity: string; tables: string[] } {
  const db = new AppDatabase(p)
  db.init()
  const version = db.userVersion()
  const integrity = db.integrityCheck()
  const tables = (
    db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
  db.close()
  return { version, integrity, tables }
}

console.log(`建库路径: ${dbPath}`)
const first = initOnce(dbPath)
console.log(`第 1 次建库: OK (user_version=${first.version}, integrity=${first.integrity}, 表数=${first.tables.length})`)
const second = initOnce(dbPath)
console.log(`第 2 次建库: OK (user_version=${second.version}, integrity=${second.integrity}, 表数=${second.tables.length})`)
console.log(`表清单(${second.tables.length}): ${second.tables.join(', ')}`)
if (first.version !== second.version || first.tables.join() !== second.tables.join()) {
  console.error('FAIL: 两次建库结果不一致')
  process.exit(1)
}
console.log('幂等建库 PASS')
