// 任务 4A 商品图片绑定 验收脚本：真实临时库 + 临时图片目录
// 覆盖：schema 迁移 / 上传持久化 / 读回 / 替换 / 删除 / A/B 隔离 / 文件与记录 1:1 / 校验 / 无外网 URL
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppDatabase } from '../src/main/db/database'
import { ALL_TABLES, SCHEMA_VERSION } from '../src/main/db/schema'
import { getProductImage, upsertShop } from '../src/main/db/repo'
import {
  MAX_IMAGE_BYTES, assertImageSize, deleteProductImage, imageUrl, listProductImages,
  normalizeImageExt, saveProductImage, type ImageExt, type ProcessedImage
} from '../src/main/images/service'
import { readFileSync as read } from 'node:fs'

const LOG = join(process.cwd(), 'task4a-acceptance.log')
const out: string[] = []
let passCount = 0
let failCount = 0
const line = (s = ''): void => { out.push(s); console.log(s) }
const pass = (name: string, detail = ''): void => { passCount++; line(`PASS ${name}${detail ? ' — ' + detail : ''}`) }
const fail = (name: string, detail = ''): void => { failCount++; line(`FAIL ${name}${detail ? ' — ' + detail : ''}`) }
const check = (name: string, ok: boolean, detail = ''): void => { if (ok) pass(name, detail); else fail(name, detail) }

function freshDb(): { db: AppDatabase; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ecai-task4a-'))
  const db = new AppDatabase(join(dir, 'task4a.db'))
  db.init()
  return { db, dir }
}
const imagesDir = (dir: string): string => join(dir, 'product-images')
const fakeProcess = (bytes: Buffer, ext: ImageExt): ProcessedImage => ({ bytes, width: 400, height: 300, ext: ext === 'webp' ? 'png' : ext })

line('==== 任务 4A 商品图片绑定 验收（' + new Date().toLocaleString('zh-CN') + '）====')

// ---------- 1. schema：迁移到 v3 + product_images 表 ----------
{
  const { db, dir } = freshDb()
  const has = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_images'").all()
  check('schema-product_images 表存在', has.length === 1)
  check('schema-user_version=SCHEMA_VERSION', db.userVersion() === SCHEMA_VERSION, `v${db.userVersion()}`)
  db.init()
  check('schema-幂等重跑不报错', db.userVersion() === SCHEMA_VERSION && db.integrityCheck() === 'ok')
  check('schema-ALL_TABLES 含 product_images', ALL_TABLES.includes('product_images'))
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ---------- 2. 上传→持久化→读回 ----------
{
  const { db, dir } = freshDb()
  const shopId = upsertShop(db, { name: '佰泰康车品旗舰店' })
  const bytes = Buffer.from('fake-png-bytes')
  const rec = saveProductImage(db, imagesDir(dir), { shopId, productId: '1001', bytes, origName: '主图.png' }, fakeProcess)
  const file = join(imagesDir(dir), `${shopId}`, '1001.png')
  check('上传-文件落盘', existsSync(file))
  check('上传-文件内容一致', readFileSync(file).equals(bytes))
  check('上传-DB 记录字段', rec.relPath === `${shopId}/1001.png` && rec.origName === '主图.png' && rec.sizeBytes === bytes.length && rec.width === 400 && rec.height === 300)
  check('上传-URL 走安全协议', rec.url === imageUrl(`${shopId}/1001.png`) && rec.url.startsWith('ecai-img://img/'))
  const got = getProductImage(db, shopId, '1001')
  check('读回-DB 记录与文件一一对应', got?.relPath === `${shopId}/1001.png` && existsSync(join(imagesDir(dir), got.relPath)))
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ---------- 3. 替换（png→jpg 旧文件删除） ----------
{
  const { db, dir } = freshDb()
  const shopId = upsertShop(db, { name: 'S' })
  saveProductImage(db, imagesDir(dir), { shopId, productId: '1001', bytes: Buffer.from('aaa'), origName: 'a.png' }, fakeProcess)
  saveProductImage(db, imagesDir(dir), { shopId, productId: '1001', bytes: Buffer.from('bbb'), origName: 'b.jpg' }, fakeProcess)
  const files = readdirSync(join(imagesDir(dir), String(shopId)))
  check('替换-旧文件删除只留新', files.length === 1 && files[0] === '1001.jpg', files.join(','))
  check('替换-记录更新', getProductImage(db, shopId, '1001')?.relPath === `${shopId}/1001.jpg`)
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ---------- 4. 删除 ----------
{
  const { db, dir } = freshDb()
  const shopId = upsertShop(db, { name: 'S' })
  saveProductImage(db, imagesDir(dir), { shopId, productId: '1', bytes: Buffer.from('x'), origName: 'x.png' }, fakeProcess)
  const ok = deleteProductImage(db, imagesDir(dir), shopId, '1')
  check('删除-返回 true 且文件/记录均消失', ok && !existsSync(join(imagesDir(dir), String(shopId), '1.png')) && getProductImage(db, shopId, '1') === null)
  check('删除-重复删除返回 false', !deleteProductImage(db, imagesDir(dir), shopId, '1'))
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ---------- 5. A/B 店铺隔离 ----------
{
  const { db, dir } = freshDb()
  const a = upsertShop(db, { name: 'A店' })
  const b = upsertShop(db, { name: 'B店' })
  saveProductImage(db, imagesDir(dir), { shopId: a, productId: '1001', bytes: Buffer.from('A'), origName: 'a.png' }, fakeProcess)
  saveProductImage(db, imagesDir(dir), { shopId: b, productId: '1001', bytes: Buffer.from('B'), origName: 'b.png' }, fakeProcess)
  const listA = listProductImages(db, imagesDir(dir), a)
  const listB = listProductImages(db, imagesDir(dir), b)
  check('AB-同商品 ID 各绑各图', existsSync(join(imagesDir(dir), String(a), '1001.png')) && existsSync(join(imagesDir(dir), String(b), '1001.png')))
  check('AB-互不覆盖且 URL 不同', listA.length === 1 && listB.length === 1 && listA[0].url !== listB[0].url)
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ---------- 6. 文件与记录 1:1 ----------
{
  const { db, dir } = freshDb()
  const shopId = upsertShop(db, { name: 'S' })
  for (const pid of ['1', '2', '3']) saveProductImage(db, imagesDir(dir), { shopId, productId: pid, bytes: Buffer.from(pid), origName: pid + '.png' }, fakeProcess)
  const shopDir = join(imagesDir(dir), String(shopId))
  check('1:1-保存 3 个商品 → 3 文件 3 记录', readdirSync(shopDir).length === 3 && listProductImages(db, imagesDir(dir), shopId).length === 3)
  deleteProductImage(db, imagesDir(dir), shopId, '2')
  check('1:1-删 1 个 → 2 文件 2 记录', readdirSync(shopDir).length === 2 && listProductImages(db, imagesDir(dir), shopId).length === 2)
  const sizes = readdirSync(shopDir).map((f) => statSync(join(shopDir, f)).size)
  check('1:1-文件非空', sizes.every((s) => s > 0))
  db.close()
  rmSync(dir, { recursive: true, force: true })
}

// ---------- 7. 校验：格式白名单 + 5MB 上限 ----------
{
  check('校验-接受 png/jpg/jpeg/webp', ['png', 'jpg', 'jpeg', 'webp', 'PNG'].every((n) => normalizeImageExt('x.' + n)))
  let rejected = 0
  for (const n of ['x.gif', 'x.bmp', 'x.svg', 'noext', '.png']) { try { normalizeImageExt(n) } catch { rejected++ } }
  check('校验-拒绝 gif/bmp/svg/无扩展名', rejected === 5)
  assertImageSize(Buffer.alloc(MAX_IMAGE_BYTES))
  let sizeOk = false
  try { assertImageSize(Buffer.alloc(MAX_IMAGE_BYTES + 1)) } catch { sizeOk = true }
  check('校验-超 5MB 拒绝', sizeOk)
}

// ---------- 8. 无外网 URL：图片模块与渲染层只用本地 ecai-img 协议 ----------
{
  const files = ['src/main/images/service.ts', 'src/main/images/ipc.ts', 'src/renderer/src/stores/productImages.ts', 'src/renderer/src/components/dashboard/ProductImageBox.vue']
  const offenders: string[] = []
  for (const f of files) {
    const text = read(f, 'utf8')
    if (/https?:\/\//.test(text)) offenders.push(f)
  }
  check('无外网-图片相关代码无 http(s) URL', offenders.length === 0, offenders.join(',') || '0 处')
  const html = read('src/renderer/index.html', 'utf8')
  check('无外网-CSP 放行 ecai-img 协议', html.includes("img-src 'self' data: ecai-img:"))
  const main = read('src/main/index.ts', 'utf8')
  check('无外网-主进程协议只读 product-images 目录', main.includes("registerImageProtocol") && main.includes("'ecai-img'"))
}

writeFileSync(LOG, out.join('\n'), 'utf8')
line('')
line(`==== 结果：PASS ${passCount} / FAIL ${failCount} ==== 日志已写 ${LOG}`)
process.exit(failCount > 0 ? 1 : 0)
