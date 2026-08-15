# -*- coding: utf-8 -*-
import re, sqlite3, os

base = r"C:\Users\Administrator\Desktop\新建文件夹\ai-shop-workbench\out\task7-exports"
db = sqlite3.connect(r"C:\Users\Administrator\AppData\Roaming\EC AI\ecai.db")
db.row_factory = sqlite3.Row

FILES = ["2026-08-11_日报.html", "2026-08-14_周报.html"]
allok = True
for f in FILES:
    p = os.path.join(base, f)
    t = open(p, encoding="utf-8").read()
    checks = {
        "exists": os.path.exists(p),
        "size": os.path.getsize(p) > 50000,
        "no_???": "???" not in t,
        "no_script_src": not re.search(r'<script[^>]+src=', t, re.I),
        "no_link_href_http": not re.search(r'href\s*=\s*["\']https?:', t, re.I),
        "no_src_http": not re.search(r'src\s*=\s*["\']https?:', t, re.I),
        "no_import": "@import" not in t,
        "title": ("经营日报" in t) or ("经营周报" in t),
        "chart_trend": "chart-trend" in t,
        "chart_product": "chart-product" in t,
        "chart_promo": "chart-promo" in t,
        "chart_refund": "chart-refund" in t,
        "chart_keyword": "chart-keyword" in t,
        "report_data_injected": "window.__REPORT_DATA__ =" in t,
        "echarts_inlined": ("Apache License" in t) and ("echarts.init" in t),
        "shop": "佰泰康车品旗舰店" in t,
        "comment_section": "AI 评语" in t,
        "cmt_summary_heading": "<h3 class='cmt-summary-title'>全店汇总</h3>" in t,
        "cov_line": "数据覆盖" in t,
    }
    if f.startswith("2026-08-11"):
        checks["lag_note"] = "数据截止 2026-08-11，昨日无新数据" in t
        checks["lag_alert"] = 'class="lag-alert"' in t
        checks["cov_1_1"] = "经营 1/1 天" in t
        checks["cov_cutoff"] = "数据截止 2026-08-11" in t
        checks["window_0811"] = "2026-08-11 ~ 2026-08-11" in t
    else:
        checks["cov_4_7"] = "经营 4/7 天" in t
        checks["cov_cutoff"] = "数据截止 2026-08-11" in t
        checks["no_lag"] = "昨日无新数据" not in t
        checks["window_7d"] = "近7天" in t
    print(f, {k: bool(v) for k, v in checks.items()})
    allok = allok and all(bool(v) for v in checks.values())

def csv_rows(p):
    t = open(p, encoding="utf-8-sig").read().strip().splitlines()
    head = t[0].split(",")
    out = []
    for line in t[1:]:
        out.append(dict(zip(head, line.split(","))))
    return out

daily = csv_rows(os.path.join(base, "2026-08-08_每日数据.csv"))
db_sum = db.execute("SELECT COALESCE(SUM(pay_amount_fen),0) s, COUNT(*) n FROM daily_metrics WHERE shop_id=1 AND date>='2026-08-08' AND date<='2026-08-11'").fetchone()
csv_sum = round(sum(float(r["支付金额元"]) for r in daily), 2)
ok1 = abs(csv_sum - db_sum["s"]/100) < 0.01 and len(daily) == db_sum["n"]
print("DAILY csv rows:", len(daily), "csv_sum:", csv_sum, "db_sum:", round(db_sum["s"]/100, 2), "db_n:", db_sum["n"], "match:", ok1)
allok = allok and ok1

refund = csv_rows(os.path.join(base, "2026-08-14_退款单.csv"))
db_refund = db.execute("SELECT COALESCE(SUM(refund_amount_fen),0) s, COUNT(*) n FROM refund_orders WHERE shop_id=1 AND substr(refund_finish_time,1,10)>='2026-08-08' AND substr(refund_finish_time,1,10)<='2026-08-14'").fetchone()
csv_refund_sum = round(sum(float(r["退款总额元"]) for r in refund), 2)
ok2 = abs(csv_refund_sum - db_refund["s"]/100) < 0.01 and len(refund) == db_refund["n"]
print("REFUND csv rows:", len(refund), "csv_sum:", csv_refund_sum, "db_sum:", round(db_refund["s"]/100, 2), "db_n:", db_refund["n"], "match:", ok2)
allok = allok and ok2

product = csv_rows(os.path.join(base, "2026-08-14_商品明细.csv"))
db_prod_n = db.execute("SELECT COUNT(*) n FROM (SELECT product_id FROM product_daily WHERE shop_id=1 AND date>='2026-08-08' AND date<='2026-08-14' GROUP BY product_id)").fetchone()["n"]
ok3 = len(product) == db_prod_n
print("PRODUCT csv rows:", len(product), "db groups:", db_prod_n, "match:", ok3)
allok = allok and ok3

# reports 留痕：最新 daily 记录窗口=08-11；HTML 日报记录文件名=2026-08-11_日报.html
last_daily = db.execute("SELECT report_date, file_path FROM reports WHERE type='daily' ORDER BY id DESC LIMIT 1").fetchone()
ok4 = last_daily and last_daily["report_date"] == "2026-08-11"
daily_html = db.execute("SELECT report_date, file_path FROM reports WHERE type='daily' AND file_path LIKE '%_日报.html' ORDER BY id DESC LIMIT 1").fetchone()
ok4b = daily_html and daily_html["report_date"] == "2026-08-11" and "2026-08-11_日报.html" in (daily_html["file_path"] or "")
print("reports last daily:", dict(last_daily) if last_daily else None, "match:", ok4, "| html record:", dict(daily_html) if daily_html else None, "match:", ok4b)
allok = allok and ok4 and ok4b

pdf = os.path.join(base, "2026-08-11_日报.pdf")
ok5 = os.path.exists(pdf) and os.path.getsize(pdf) > 50000
print("pdf exists:", ok5, os.path.getsize(pdf) if os.path.exists(pdf) else 0)
allok = allok and ok5

print("ALL_TRUE:", allok)