// 数据库 schema（任务 2 唯一接缝，定死后各模块只认表结构）
// 约定：金额=分(INTEGER)、数量=INTEGER、比率=0~1(REAL)、日期=YYYY-MM-DD、时间戳=YYYY-MM-DD HH:MM:SS

export const SCHEMA_VERSION = 10

export interface Migration {
  version: number
  statements: string[]
}

const DDL_V1: string[] = [
  // ---------- 1 settings：个性化项 key-value ----------
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,

  // ---------- 2 shops：店铺 ----------
  `CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT '天猫',
    shop_code TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_name ON shops(name)`,

  // ---------- 3 imports：导入历史 ----------
  `CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    source_type TEXT NOT NULL,
    source_file TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    date_start TEXT,
    date_end TEXT,
    file_hash TEXT,
    status TEXT NOT NULL DEFAULT 'ok',
    note TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_imports_shop ON imports(shop_id)`,

  // ---------- 4 daily_metrics：经营日报（来源：经营数据 xlsx） ----------
  `CREATE TABLE IF NOT EXISTS daily_metrics (
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    date TEXT NOT NULL,
    pay_amount_fen INTEGER NOT NULL DEFAULT 0,
    net_sales_fen INTEGER NOT NULL DEFAULT 0,
    profit_fen INTEGER NOT NULL DEFAULT 0,
    visitors INTEGER NOT NULL DEFAULT 0,
    refund_amount_fen INTEGER NOT NULL DEFAULT 0,
    promo_cost_fen INTEGER NOT NULL DEFAULT 0,
    pay_rate REAL,
    PRIMARY KEY (shop_id, date)
  )`,

  // ---------- 5 product_daily：商品日报（商品报表 xls + 商品明细 xlsx + 咨询 csv 三源合一） ----------
  `CREATE TABLE IF NOT EXISTS product_daily (
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    product_id TEXT NOT NULL,
    date TEXT NOT NULL,
    product_name TEXT,
    visitors INTEGER NOT NULL DEFAULT 0,
    page_views INTEGER NOT NULL DEFAULT 0,
    pay_amount_fen INTEGER NOT NULL DEFAULT 0,
    refund_amount_fen INTEGER NOT NULL DEFAULT 0,
    promo_cost_fen INTEGER NOT NULL DEFAULT 0,
    profit_fen INTEGER NOT NULL DEFAULT 0,
    net_sales_fen INTEGER NOT NULL DEFAULT 0,
    sales_count INTEGER NOT NULL DEFAULT 0,
    consult_count INTEGER NOT NULL DEFAULT 0,
    pay_rate REAL,
    PRIMARY KEY (shop_id, product_id, date)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_product_daily_date ON product_daily(date)`,

  // ---------- 6 promo_daily：推广日报（来源：推广 csv gbk） ----------
  `CREATE TABLE IF NOT EXISTS promo_daily (
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    date TEXT NOT NULL,
    ad_entity_id TEXT NOT NULL,
    ad_entity_name TEXT,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    cost_fen INTEGER NOT NULL DEFAULT 0,
    ctr REAL,
    roas REAL,
    PRIMARY KEY (shop_id, date, ad_entity_id)
  )`,

  // ---------- 7 refund_orders：退款单（来源：退款单 xlsx；按 10 万行规模设计） ----------
  `CREATE TABLE IF NOT EXISTS refund_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    order_no TEXT NOT NULL,
    refund_no TEXT NOT NULL UNIQUE,
    product_id TEXT,
    product_title TEXT,
    refund_amount_fen INTEGER NOT NULL DEFAULT 0,
    buyer_pay_amount_fen INTEGER NOT NULL DEFAULT 0,
    refund_status TEXT,
    goods_status TEXT,
    after_sale_type TEXT,
    payment_time TEXT,
    refund_finish_time TEXT,
    refund_apply_time TEXT,
    refund_reason TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_refund_orders_shop_time ON refund_orders(shop_id, payment_time)`,
  `CREATE INDEX IF NOT EXISTS idx_refund_orders_product ON refund_orders(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_refund_orders_order ON refund_orders(order_no)`,

  // ---------- 8 cs_daily：客服日报（来源：客服绩效 xlsx，剔除末 6 行汇总/对比） ----------
  `CREATE TABLE IF NOT EXISTS cs_daily (
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    date TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    inquiry_final_pay_count INTEGER NOT NULL DEFAULT 0,
    inquiry_count INTEGER NOT NULL DEFAULT 0,
    inquiry_final_pay_rate REAL,
    first_response_seconds REAL,
    avg_response_seconds REAL,
    satisfaction_rate REAL,
    reply_rate REAL,
    inquiry_final_pay_amount_fen INTEGER NOT NULL DEFAULT 0,
    refund_amount_fen INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (shop_id, date, staff_name)
  )`,

  // ---------- 9 search_keywords：搜索词（来源：搜索词 xls 第 6 行表头） ----------
  `CREATE TABLE IF NOT EXISTS search_keywords (
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    date TEXT NOT NULL,
    keyword TEXT NOT NULL,
    visitors INTEGER NOT NULL DEFAULT 0,
    cart_add_count INTEGER NOT NULL DEFAULT 0,
    favorite_count INTEGER NOT NULL DEFAULT 0,
    pay_buyer_count INTEGER NOT NULL DEFAULT 0,
    pay_rate REAL,
    pay_amount_fen INTEGER NOT NULL DEFAULT 0,
    unit_price_fen INTEGER,
    uv_value_fen INTEGER,
    PRIMARY KEY (shop_id, date, keyword)
  )`,

  // ---------- 10 models：AI 模型配置（API key 只存密文，任务 5 用 safeStorage 落库） ----------
  `CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'openai-compatible',
    base_url TEXT,
    api_key_enc TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,

  // ---------- 11 conversations：对话 ----------
  `CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER REFERENCES shops(id),
    title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_shop ON conversations(shop_id, updated_at)`,

  // ---------- 12 messages：消息 ----------
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id)`,

  // ---------- 13 reports：日报/周报导出记录 ----------
  `CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    type TEXT NOT NULL,
    report_date TEXT NOT NULL,
    content TEXT,
    file_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reports_shop_date ON reports(shop_id, type, report_date)`,

  // ---------- 14 ai_analyses：AI 评语（同日同模块去重） ----------
  `CREATE TABLE IF NOT EXISTS ai_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    module TEXT NOT NULL,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    source_skill_id INTEGER REFERENCES skills(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (shop_id, module, date)
  )`,

  // ---------- 15 skills：技能 ----------
  `CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    installed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,

  // ---------- 16 module_skills：模块 ↔ 技能绑定 ----------
  `CREATE TABLE IF NOT EXISTS module_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL,
    skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 0,
    UNIQUE (module, skill_id)
  )`,

  // ---------- 17 dsr_daily：DSR 日维度（新增：DSR 页需要，来源 DSR xlsx 日区块） ----------
  `CREATE TABLE IF NOT EXISTS dsr_daily (
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    date TEXT NOT NULL,
    description_score REAL,
    logistics_score REAL,
    service_score REAL,
    PRIMARY KEY (shop_id, date)
  )`,

  // ---------- 18 dsr_180d：DSR 180 天指标快照（来源 DSR xlsx 180 天区块） ----------
  `CREATE TABLE IF NOT EXISTS dsr_180d (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    snapshot_date TEXT NOT NULL,
    indicator TEXT NOT NULL,
    score REAL,
    trend TEXT,
    industry_avg REAL,
    compare_text TEXT,
    target REAL,
    gap_text TEXT,
    UNIQUE (shop_id, snapshot_date, indicator)
  )`
]

const DDL_V2: string[] = [
  // 任务 3：imports 增加人工修正日志/耗时/归档路径（已有库走 ALTER；新库 v1 建表后补列）
  `ALTER TABLE imports ADD COLUMN fix_log TEXT`,
  `ALTER TABLE imports ADD COLUMN elapsed_ms INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE imports ADD COLUMN archive_path TEXT`
]


const DDL_V3: string[] = [
  // ---------- 19 product_images 商品图片（任务 4A）：存 userData/product-images/{店铺ID}/{商品ID}.{ext} ----------
  `CREATE TABLE IF NOT EXISTS product_images (
    shop_id INTEGER NOT NULL REFERENCES shops(id),
    product_id TEXT NOT NULL,
    rel_path TEXT NOT NULL,
    orig_name TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    PRIMARY KEY (shop_id, product_id)
  )`
]

const DDL_V4: string[] = [
  // 任务 5：models 增加「默认模型」标记（互斥，setDefaultModel 维护）；已有库走 ALTER，新库 v1 建表后补列
  `ALTER TABLE models ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`
]

const DDL_V5: string[] = [
  // 任务6：messages 记录斜杠所选技能（skills 行）；ai_analyses 记录所用模型；新建聊天质检历史 qa_runs 表
  `ALTER TABLE messages ADD COLUMN skill_id INTEGER REFERENCES skills(id)`,
  `ALTER TABLE ai_analyses ADD COLUMN model TEXT`,
  `CREATE TABLE IF NOT EXISTS qa_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER REFERENCES shops(id),
    file_count INTEGER NOT NULL DEFAULT 0,
    session_count INTEGER NOT NULL DEFAULT 0,
    model TEXT,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ok',
    report TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`
]

const DDL_V6: string[] = [
  // 任务4B：daily_metrics 补「销售单数(支付)」订单数字段（已有库走 ALTER，新库 v1 建表后补列；口径=经营源「销售单数(支付)」）
  `ALTER TABLE daily_metrics ADD COLUMN sales_count INTEGER NOT NULL DEFAULT 0`
]

const DDL_V7: string[] = [
  // 任务4B：promo_daily 补「总成交金额/总成交笔数/点击转化率」（推广明细表 成交金额/成交笔数/转化 数据源=推广 csv 总成交金额/总成交笔数/点击转化率）
  `ALTER TABLE promo_daily ADD COLUMN pay_amount_fen INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE promo_daily ADD COLUMN sales_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE promo_daily ADD COLUMN pay_rate REAL`
]

const DDL_V8: string[] = [
  // 任务4F：质检历史导出汇总 CSV 需要客服数，qa_runs 补 agent_count（历史行默认 0）
  `ALTER TABLE qa_runs ADD COLUMN agent_count INTEGER NOT NULL DEFAULT 0`
]

const DDL_V9: string[] = [
  // 任务4G：投产比计算历史（本地工具数据，不进数据包；params/result 存 JSON 原文）
  `CREATE TABLE IF NOT EXISTS calculator_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    params_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    passed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`
]

const DDL_V10: string[] = [
  // 任务4V：product_daily 新增「搜索引导访客数」（商品_全部第 35 列；按 DDL_V7 先例只走 ALTER，不在 V1 建表加列防新库 duplicate column）
  `ALTER TABLE product_daily ADD COLUMN search_guide_visitors INTEGER`
]

export const MIGRATIONS: Migration[] = [{ version: 1, statements: DDL_V1 }, { version: 2, statements: DDL_V2 }, { version: 3, statements: DDL_V3 }, { version: 4, statements: DDL_V4 }, { version: 5, statements: DDL_V5 }, { version: 6, statements: DDL_V6 }, { version: 7, statements: DDL_V7 }, { version: 8, statements: DDL_V8 }, { version: 9, statements: DDL_V9 }, { version: 10, statements: DDL_V10 }]

/** 任务书要求的 16 张表（14 业务 + skills/module_skills） */
export const REQUIRED_TABLES = [
  'settings', 'shops', 'imports', 'daily_metrics', 'product_daily', 'promo_daily',
  'refund_orders', 'cs_daily', 'search_keywords', 'models', 'conversations',
  'messages', 'reports', 'ai_analyses', 'skills', 'module_skills'
] as const

/** 任务书允许按实际增减：DSR 数据无落点，新增两张表并写入数据字典 */
export const EXTRA_TABLES = ['dsr_daily', 'dsr_180d', 'product_images', 'qa_runs', 'calculator_runs'] as const

export const ALL_TABLES: readonly string[] = [...REQUIRED_TABLES, ...EXTRA_TABLES]
