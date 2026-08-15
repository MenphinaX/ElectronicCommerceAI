# -*- coding: utf-8 -*-
import re, sqlite3, os, json
base = r"C:\Users\Administrator\Desktop\新建文件夹\ai-shop-workbench\out\task7-exports"
db = sqlite3.connect(r"C:\Users\Administrator\AppData\Roaming\EC AI\ecai.db")
db.row_factory = sqlite3.Row

def load_data(fname):
    t = open(os.path.join(base, fname), encoding="utf-8").read()
    m = re.search(r"window.__REPORT_DATA__ = (\{.*?\});\n", t, re.S)
    return json.loads(m.group(1))

allok = True

# 周报：KPI == DB SUM(08-08..08-14)；覆盖 4/7；数据截止 08-11
d = load_data("2026-08-14_周报.html")
kpi = d["kpi"]
db_sum = db.execute("SELECT COALESCE(SUM(pay_amount_fen),0) s FROM daily_metrics WHERE shop_id=1 AND date>='2026-08-08' AND date<='2026-08-14'").fetchone()["s"]
w1 = kpi["payAmountFen"] == db_sum
print("WEEKLY kpi.payAmountFen:", kpi["payAmountFen"], "DB sum:", db_sum, "match:", w1)
cov_daily = next((c for c in d["coverage"] if c["key"] == "daily"), None)
w2 = cov_daily and cov_daily["coveredDays"] == 4 and cov_daily["expectedDays"] == 7
print("WEEKLY coverage daily:", cov_daily, "match:", w2)
w3 = d["dataCutoff"] == "2026-08-11" and d["window"]["start"] == "2026-08-08" and d["window"]["end"] == "2026-08-14"
print("WEEKLY cutoff/window:", d["dataCutoff"], d["window"]["start"], d["window"]["end"], "match:", w3)
w4 = len([c for c in d["comments"] if c["content"]]) == 9
print("WEEKLY comments present:", w4)
allok = allok and w1 and w2 and w3 and w4

# 日报（滞后场景）：窗口=08-11、请求昨日=08-13、KPI==DB(08-11)、评语 9 模块全有且与窗口同口径
d2 = load_data("2026-08-11_日报.html")
k2 = d2["kpi"]
db_0811 = db.execute("SELECT pay_amount_fen s FROM daily_metrics WHERE shop_id=1 AND date='2026-08-11'").fetchone()["s"]
d1 = d2["window"]["end"] == "2026-08-11" and d2["window"]["start"] == "2026-08-11"
d2ok = d2["requestedEnd"] == "2026-08-13"
d3 = d2["dataCutoff"] == "2026-08-11" and d2["lagNote"] and "数据截止 2026-08-11，昨日无新数据" in d2["lagNote"]
d4 = k2["payAmountFen"] == db_0811
print("DAILY window:", d2["window"]["end"], "requested:", d2["requestedEnd"], "match:", d1, d2ok)
print("DAILY lagNote:", (d2["lagNote"] or "")[:60], "match:", d3)
print("DAILY kpi.payAmountFen:", k2["payAmountFen"], "DB 08-11:", db_0811, "match:", d4)
cmts = [c for c in d2["comments"] if c["content"]]
d5 = len(cmts) == 9
# 评语窗口与页面同口径：ai_analyses 存在 9 条 date=2026-08-11（= 报告窗口 end）
db_cmts = db.execute("SELECT COUNT(*) n FROM ai_analyses WHERE shop_id=1 AND date='2026-08-11'").fetchone()["n"]
d6 = db_cmts == 9
print("DAILY comments present:", d5, "ai_analyses[2026-08-11]:", db_cmts, "match:", d6)
allok = allok and d1 and d2ok and d3 and d4 and d5 and d6

print("ALL_TRUE:", allok)