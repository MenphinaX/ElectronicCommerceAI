// 任务10验收辅助：本地 OpenAI 兼容 chat/completions 模拟服务（仅监听 127.0.0.1）
// 用途：本机无外部模型 key 时，走应用真实 HTTP 调用链路完成「评语生成」全流程；
// 换真实 key 即接真实模型（任务6已用 DeepSeek 直连验证过同一代码路径）。
var http = require('http');
var fs = require('fs');
var path = require('path');
var PORT = Number(process.env.TASK10_MOCK_PORT || 9455);
var LOG = process.env.TASK10_MOCK_LOG || path.join(__dirname, '..', 'out', 'task10', 'mock-llm-requests.log');
fs.mkdirSync(path.dirname(LOG), { recursive: true });
var MODULES = {
  '摘要': '全店摘要：本期支付金额与访客数总体平稳，利润(支付预估)处于健康区间，退款规模可控，整体经营稳健，建议保持当前节奏并继续盯紧退款异常。',
  '核心指标': '核心指标：支付金额、访客数、转化率环比接近，客单价小幅上行；建议关注流量结构与转化漏斗，优化高跳出入口。',
  '经营趋势': '经营趋势：近 7 天支付金额围绕日均水平波动，无明显单日异常；退款率保持低位，经营趋势稳定，未见系统性风险信号。',
  '单品分析': '单品分析：热销商品集中度适中，TOP 商品贡献稳定；建议对高动销商品加大备货与详情页优化，保持主推品库存充足。',
  '推广分析': '推广分析：花费产出比处于合理区间，搜索推广词集中；建议保留高 ROI 词、暂停低效词，并测试新的精准长尾词。',
  '退款分析': '退款分析：退款金额占支付金额比例低于阈值，退款原因以常规售后为主，无系统性质量问题信号，可继续按现有售后流程处理。',
  'DSR 与客服': 'DSR 与客服：店铺 DSR 维持高位，客服询单量正常，回复响应表现稳定，建议保持当前服务节奏并强化晚间值班覆盖。',
  '搜索词': '搜索词：引流搜索词以品牌词与品类词为主，点击率表现良好；可继续优化转化高的词，扩充相关长尾词库。',
  '建议动作': '建议动作：明日优先复盘转化率下降的流量词、跟进热销商品库存，并持续监控退款异常订单；周末前完成详情页 A/B 测试排期。'
};
var server = http.createServer(function (req, res) {
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (req.method === 'POST' && req.url.indexOf('/chat/completions') >= 0) {
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      try {
        var data = JSON.parse(body);
        var model = data.model || 'unknown';
        var userText = (data.messages || []).filter(function (m) { return m.role === 'user'; }).map(function (m) { return String(m.content || ''); }).join('\n');
        var content = MODULES['摘要'];
        var mm = userText.match(/【本模块】[^（(]*[（(]([^）)]+)[）)]/);
        if (mm) { var label = mm[1]; Object.keys(MODULES).forEach(function (key) { if (label.indexOf(key) >= 0) content = MODULES[key]; }); }
        if (!mm) { Object.keys(MODULES).forEach(function (key) { if (userText.indexOf(key) >= 0) content = MODULES[key]; }); }
        fs.appendFileSync(LOG, JSON.stringify({ time: new Date().toISOString(), model: model, module: userText.slice(0, 160) }) + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'chatcmpl-task10', object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: model, choices: [{ index: 0, message: { role: 'assistant', content: content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: String(e && e.message) } }));
      }
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});
server.listen(PORT, '127.0.0.1', function () { console.log('MOCK_LLM_READY port=' + PORT); });