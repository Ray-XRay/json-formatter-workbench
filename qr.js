/* 二维码 / 条码生成器：bwip-js（本地 vendor）渲染到 canvas。
   纯静态零后端；格式、纠错级别、颜色都在本页改，生成即所见。
   Vue 3 迁移：状态全部进 Vue 的 reactive，模板用 v-model/@click 绑控件；
   渲染仍走原来的同步 DOM 写法（render / renderGs1Table / renderQrHistory 等），
   由 flush:'sync' 的 watcher 驱动——测试是同步读 DOM 的，Vue 的异步渲染会让它们读到旧值，
   所以输出一律同步写 DOM，不用 {{ }} / v-show / v-for。
   GS1 参数表、历史列表继续用原来的命令式创建（createElement + 逐行监听）。
   gs1TemplateInput / gs1NewAi / gs1NewValue 不进 v-model：测试是直接改 .value 后点按钮，
   处理函数直接读 DOM，v-model 反而会读不到。 */
(function () {
  'use strict';

  var Vue = window.Vue;
  function $(id) { return document.getElementById(id); }

  /* 大小档记住上次选择，不再默认中号（恢复在 state 初始化时做，Vue 挂载后同步到下拉框） */
  var SIZE_KEY = 'qr-wb-size';
  var savedSize = 'medium';
  try {
    var _ss = localStorage.getItem(SIZE_KEY);
    if (_ss === 'small' || _ss === 'medium' || _ss === 'large') savedSize = _ss;
  } catch (e) {}

  /* Vue 状态：与模板的 v-model 对应；渲染函数直接读它 */
  var state = Vue.reactive({
    theme: 'dark', format: 'qrcode', text: '', scale: savedSize,
    ec: 'M', showText: true, fgColor: '#000000', bgColor: '#ffffff'
  });
  /* 恢复选项/修正值时临时关 watcher，避免中间态反复触发 render */
  var suppressWatch = false;

  var toastTimer = null;
  function showToast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  function setStatus(type, msg) {
    var dot = $('statusDot');
    dot.className = 'dot ' + (type === 'ok' ? 'ok' : type === 'err' ? 'err' : type === 'warn' ? 'warn' : 'idle');
    $('statusText').textContent = msg;
  }

  /* ---------- 主题（与其它页共用 json-wb-theme） ---------- */
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    var sel = $('themeSelect');
    if (sel) sel.value = theme;
    try { localStorage.setItem('json-wb-theme', theme); } catch (e) {}
  }

  /* 顶栏品牌切换：点左上角品牌块打开工具下拉（开关由模板 @click 调，文档级收起在 mounted 里注册）。
     注意：每次现查 DOM，不要缓存引用——Vue 挂载时可能替换节点，缓存的引用会指向已 detached 的旧节点 */
  function closeBrand() {
    $('brandMenu').hidden = true;
    $('brandBtn').setAttribute('aria-expanded', 'false');
  }
  function toggleBrand() {
    var menu = $('brandMenu');
    menu.hidden = !menu.hidden;
    $('brandBtn').setAttribute('aria-expanded', String(!menu.hidden));
  }
  /* 干净地址（/qr 等）：已在当前工具时不跳转；本地 file:// 直接打开时补回 .html */
  function goToTool(page) {
    var cur = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '');
    if (cur === '') cur = '/';
    if (page === cur) return;
    var target = page;
    if (location.protocol === 'file:') {
      target = page === '/' ? 'index.html' : page.slice(1) + '.html';
    }
    // 工具间跳转：给新页面留个标记，让它播一次进入动画（冷打开不播）；
    // 跨页过渡本身交给 View Transitions（支持的浏览器）或新页淡入（不支持的），这里不延迟、立即跳
    try { sessionStorage.setItem('json-wb-nav', '1'); } catch (e) {}
    location.href = target;
  }
  function onBrandMenuClick(e) {
    var item = e.target.closest('.brand-item');
    if (!item) return;
    var page = item.getAttribute('data-page');
    closeBrand();
    if (page) goToTool(page);
  }

  /* ---------- 可拖动分隔条（与其它页同款，比例分开存；mounted 里初始化） ---------- */
  function initResizer() {
    var panes = $('panes'), paneLeft = $('paneLeft'), divider = $('divider');
    var saved = null;
    try { saved = localStorage.getItem('qr-wb-split'); } catch (e) {}
    if (saved) {
      var pct = Math.min(75, Math.max(25, Number(saved)));
      if (pct) paneLeft.style.width = pct + '%';
    }
    divider.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      divider.classList.add('dragging');
      try { divider.setPointerCapture(e.pointerId); } catch (err) {}
      var vertical = window.innerWidth <= 820;
      var rect = panes.getBoundingClientRect();
      var startX = e.clientX;
      var startY = e.clientY;
      var startW = paneLeft.getBoundingClientRect().width;
      var startH = paneLeft.getBoundingClientRect().height;
      if (!vertical) paneLeft.style.height = '';

      function onMove(ev) {
        var p;
        if (vertical) {
          p = (startH + (ev.clientY - startY)) / rect.height * 100;
          paneLeft.style.height = Math.min(75, Math.max(25, p)) + '%';
        } else {
          p = (startW + (ev.clientX - startX)) / rect.width * 100;
          p = Math.min(75, Math.max(25, p));
          paneLeft.style.width = p + '%';
        }
      }
      function onUp() {
        divider.classList.remove('dragging');
        divider.removeEventListener('pointermove', onMove);
        divider.removeEventListener('pointerup', onUp);
        try {
          if (vertical) {
            localStorage.setItem('qr-wb-split-v', paneLeft.style.height);
          } else {
            localStorage.setItem('qr-wb-split', parseFloat(paneLeft.style.width));
          }
        } catch (err) {}
      }
      divider.addEventListener('pointermove', onMove);
      divider.addEventListener('pointerup', onUp);
    });
  }

  /* ---------- GS1 参数区横向分隔条：上下拖动，调整输入框与参数区的高度占比 ---------- */
  function initGs1Divider() {
    var paneLeft = $('paneLeft'), panel = $('gs1Panel'), div = $('gs1Divider');
    var KEY = 'qr-wb-gs1-split';
    var ratio = null;
    function applyRatio(r) {
      ratio = Math.min(60, Math.max(15, r));
      panel.style.flex = '0 0 ' + ratio + '%';
      panel.style.maxHeight = 'none';
    }
    try {
      var saved = localStorage.getItem(KEY);
      if (saved) applyRatio(Number(saved));
    } catch (e) {}
    div.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      div.classList.add('dragging');
      try { div.setPointerCapture(e.pointerId); } catch (err) {}
      var rect = paneLeft.getBoundingClientRect();
      function onMove(ev) {
        applyRatio((rect.bottom - ev.clientY) / rect.height * 100);
      }
      function onUp() {
        div.classList.remove('dragging');
        div.removeEventListener('pointermove', onMove);
        div.removeEventListener('pointerup', onUp);
        try { if (ratio) localStorage.setItem(KEY, ratio); } catch (err) {}
      }
      div.addEventListener('pointermove', onMove);
      div.addEventListener('pointerup', onUp);
    });
  }

  /* ---------- 各类型说明、示例 ---------- */
  var FORMATS = {
    qrcode: { label: 'QR Code', hint: '网址、文字都行，中文也可以。纠错级别越高越耐脏、耐遮挡，但码点越密。生成尺寸精确固定为小 200 / 中 300 / 大 400 px，内容再多也不会变。粘贴 GS1 Digital Link 链接（如 …/01/…/10/…）可在下方解析各参数。', sample: 'https://example.com', twoDim: true },
    code128: { label: '条码', hint: '字母、数字和符号都行，最常用的一维条码。', sample: 'HELLO-12345', oneDim: true }
  };

  /* 大小档：二维码按目标尺寸精确固定输出（小 200 / 中 300 / 大 400 px），最近邻重采样，内容再多尺寸也不变；
     条码的宽度天生随内容变长，只固定模块宽度 */
  var SIZE_MAP = {
    small: { qr: 200, barcodeScale: 3 },
    medium: { qr: 300, barcodeScale: 4 },
    large: { qr: 400, barcodeScale: 6 }
  };

  function currentFormat() { return state.format; }
  function hexNoHash(v) { return v.replace('#', ''); }

  function buildOpts() {
    var fmt = currentFormat();
    var size = SIZE_MAP[state.scale] || SIZE_MAP.medium;
    var opts = {
      bcid: fmt,
      text: state.text,
      backgroundcolor: hexNoHash(state.bgColor),
      barcolor: hexNoHash(state.fgColor),
      textcolor: hexNoHash(state.fgColor)
    };
    if (FORMATS[fmt].oneDim) {
      opts.height = 10;
      opts.includetext = state.showText;
      opts.scale = size.barcodeScale;
    }
    if (fmt === 'qrcode') opts.eclevel = state.ec;
    return opts;
  }

  /* 二维码精确固定尺寸：先以 1 倍率量出模块数（含静区），再以刚好 ≥ 目标尺寸的整数倍率渲染到离屏 canvas，
     最后最近邻重采样到精确的目标尺寸（200 / 300 / 400 px），内容再多尺寸也不变 */
  function renderQrExact(canvas, opts, target) {
    var base = { bcid: 'qrcode', text: opts.text, eclevel: opts.eclevel, backgroundcolor: opts.backgroundcolor, barcolor: opts.barcolor, textcolor: opts.textcolor };
    var probe = document.createElement('canvas');
    bwipjs.toCanvas(probe, Object.assign({}, base, { scale: 1 }));
    var modules = probe.width;
    var scale = Math.max(1, Math.ceil(target / modules));
    bwipjs.toCanvas(probe, Object.assign({}, base, { scale: scale }));
    canvas.width = target;
    canvas.height = target;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(probe, 0, 0, target, target);
    return modules;
  }

  /* SVG 下载也要精确尺寸：矢量图按 viewBox 缩放无损，直接写死宽高 */
  function qrSvgExact(opts, target) {
    var svg = bwipjs.toSVG({ bcid: 'qrcode', text: opts.text, scale: 1, eclevel: opts.eclevel, backgroundcolor: opts.backgroundcolor, barcolor: opts.barcolor, textcolor: opts.textcolor });
    return svg.replace('<svg ', '<svg width="' + target + '" height="' + target + '" ');
  }

  /* bwip-js 的报错自带 "bwipp.xxx#nnnn:" 前缀，先去掉；常见的翻成中文 */
  function friendlyError(e) {
    var msg = String((e && e.message) || e);
    msg = msg.replace(/^(bwipp?\.[\w]+#\d+:\s*|bwip-js:\s*)/, '');
    if (/text not specified/i.test(msg)) return '内容为空，先输入要编码的内容';
    if (/Maximum length exceeded/i.test(msg)) return '内容太长，超出该类型的容量上限';
    return msg;
  }

  function render() {
    var text = state.text;
    var canvas = $('qrCanvas');
    if (!text.trim()) {
      canvas.hidden = true;
      $('qrEmpty').hidden = false;
      $('qrStats').textContent = '等待生成';
      setStatus('idle', '就绪');
      return;
    }
    try {
      var fmt = currentFormat();
      var target = 0, modules = 0;
      if (fmt === 'qrcode') {
        target = (SIZE_MAP[state.scale] || SIZE_MAP.medium).qr;
        modules = renderQrExact(canvas, buildOpts(), target);
      } else {
        bwipjs.toCanvas(canvas, buildOpts());
      }
      canvas.hidden = false;
      $('qrEmpty').hidden = true;
      $('qrStats').textContent = FORMATS[fmt].label + ' · ' + canvas.width + ' × ' + canvas.height + ' px';
      $('detailStats').textContent = text.length + ' 字符';
      if (fmt === 'qrcode' && modules > target) {
        setStatus('warn', '已生成，但内容太密（' + modules + ' 模块），建议选大一档');
      } else {
        setStatus('ok', '已生成');
      }
    } catch (e) {
      canvas.hidden = true;
      $('qrEmpty').hidden = false;
      $('qrStats').textContent = '生成失败';
      setStatus('err', friendlyError(e));
    }
  }

  function updateFormatUI() {
    var fmt = currentFormat();
    $('formatHint').textContent = FORMATS[fmt].hint;
    $('ecWrap').style.display = fmt === 'qrcode' ? '' : 'none';
    $('textWrap').style.display = FORMATS[fmt].oneDim ? '' : 'none';
  }

  /* 输入框内容变化时同步更新字符数（v-model 的 watcher 里调；程序改值时也调） */
  function updateInputStats() {
    $('inputStats').textContent = state.text.length + ' 字符';
  }
  /* 程序改输入框：同时写 state（suppressWatch 防 watcher 重入）和 DOM，并同步更新字符数 */
  function setText(v) {
    suppressWatch = true;
    state.text = v;
    suppressWatch = false;
    $('qrInput').value = v;
    updateInputStats();
  }

  /* ---------- GS1 参数表（Postman Params 风格） ----------
     输入是 GS1 Digital Link 链接（如 https://…/01/…/10/…?17=…）或元素串
     （如 (01)…(10)…）时，把每个 AI 解析成一行参数：勾选 / AI / 名称 / 值 / 删除。
     改表格会回写输入框并重新生成；改输入框会重新解析表格。 */
  var GS1_AI = {
    '00': 'SSCC', '01': 'GTIN', '02': '内含项目 GTIN', '10': '批号', '11': '生产日期',
    '12': '到期日', '13': '包装日期', '15': '最佳使用日期', '17': '有效期至', '21': '序列号',
    '30': '数量', '37': '数量', '400': '客户订单号', '414': 'GLN',
    '8003': 'GRAI', '8004': 'GIAI', '8005': '单价', '8010': 'CPID', '8011': 'CPID 序列号',
    '8018': 'GSRN', '8020': '付款单号', '8200': '产品网址'
  };
  var GS1_DATE_AI = ['11', '12', '13', '15', '17'];
  var gs1Data = null;           // { kind: 'url'|'element', base, prefix, params: [{ai, value, from, enabled}], extraQuery }
  var gs1FromTable = false;     // 正在从表格回写输入框，跳过重新解析
  var gs1DismissedText = null;  // 用户点了收起的那份内容，改内容前不再弹出

  function gs1AiName(ai) {
    var custom = loadGs1CustomNames();
    if (custom[ai]) return custom[ai];
    if (GS1_AI[ai]) return GS1_AI[ai];
    var pre3 = ai.slice(0, 3);
    if (['310', '311', '312', '313'].indexOf(pre3) !== -1) return '净重';
    if (['320', '321'].indexOf(pre3) !== -1) return '净重（磅）';
    if (['330', '331'].indexOf(pre3) !== -1) return '毛重';
    if (['390', '391', '392', '393'].indexOf(pre3) !== -1) return '应付金额';
    return '未知 AI';
  }
  /* AI 显示名称可自定义：用户改过的名字存在本机，优先于默认名 */
  var GS1_NAMES_KEY = 'qr-wb-gs1-ai-names';
  function loadGs1CustomNames() {
    try {
      var raw = localStorage.getItem(GS1_NAMES_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }
  function saveGs1CustomName(ai, name) {
    try {
      var map = loadGs1CustomNames();
      var def = GS1_AI[ai];
      if (!name || name === def) delete map[ai];
      else map[ai] = name;
      localStorage.setItem(GS1_NAMES_KEY, JSON.stringify(map));
    } catch (e) {}
  }
  function gs1FormatDate(v) {
    if (!/^\d{6}$/.test(v)) return null;
    var mm = +v.slice(2, 4), dd = +v.slice(4, 6);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return '20' + v.slice(0, 2) + '-' + v.slice(2, 4) + '-' + v.slice(4, 6);
  }

  function parseGs1(text) {
    text = text.trim();
    if (!text) return null;
    if (text.indexOf('(') !== -1) {
      var params = [];
      var re = /\((\d{2,4})\)([^()]*)/g, m;
      while ((m = re.exec(text))) {
        if (m[2] !== '') params.push({ ai: m[1], value: m[2], from: 'element', enabled: true });
      }
      return params.length ? { kind: 'element', params: params } : null;
    }
    var u;
    try { u = new URL(text); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    var segs = u.pathname.split('/').filter(function (s) { return s !== ''; });
    var params = [], prefix = [], i = 0, inAi = false;
    while (i < segs.length) {
      var key = segs[i];
      if (/^\d{2,4}$/.test(key) && i + 1 < segs.length) {
        params.push({ ai: key, value: decodeURIComponent(segs[i + 1]), from: 'path', enabled: true });
        i += 2; inAi = true;
      } else {
        if (!inAi) prefix.push(segs[i]);
        i += 1;
      }
    }
    var extraQuery = [];
    u.searchParams.forEach(function (v, k) {
      if (/^\d{2,4}$/.test(k)) params.push({ ai: k, value: v, from: 'query', enabled: true });
      else extraQuery.push({ k: k, v: v });
    });
    if (!params.length) return null;
    return { kind: 'url', base: u.protocol + '//' + u.host, prefix: prefix, params: params, extraQuery: extraQuery };
  }

  function rebuildGs1(data) {
    var enabled = data.params.filter(function (p) { return p.enabled; });
    if (data.kind === 'element') {
      return enabled.map(function (p) { return '(' + p.ai + ')' + p.value; }).join('');
    }
    var parts = [];
    if (data.prefix.length) parts.push(data.prefix.map(encodeURIComponent).join('/'));
    enabled.filter(function (p) { return p.from === 'path'; }).forEach(function (p) {
      parts.push(p.ai + '/' + encodeURIComponent(p.value));
    });
    var out = data.base;
    if (parts.length) out += '/' + parts.join('/');
    var q = [];
    enabled.filter(function (p) { return p.from === 'query'; }).forEach(function (p) {
      q.push(p.ai + '=' + encodeURIComponent(p.value));
    });
    data.extraQuery.forEach(function (e) {
      q.push(encodeURIComponent(e.k) + '=' + encodeURIComponent(e.v));
    });
    if (q.length) out += '?' + q.join('&');
    return out;
  }

  function updateGs1Name(row, p) {
    var nameInput = row.querySelector('.gs1-name-input');
    var dateSpan = row.querySelector('.gs1-date');
    var label = gs1AiName(p.ai);
    nameInput.value = label;
    nameInput.title = '点一下可改这个 AI 的显示名称';
    var date = GS1_DATE_AI.indexOf(p.ai) !== -1 ? gs1FormatDate(p.value) : null;
    dateSpan.textContent = date || '';
    dateSpan.title = date ? label + '（' + date + '）' : '';
  }

  function renderGs1Table() {
    var panel = $('gs1Panel');
    if (!gs1Data || !gs1Data.params.length) { panel.hidden = true; $('gs1Divider').hidden = true; return; }
    panel.hidden = false;
    $('gs1Divider').hidden = false;
    $('gs1Count').textContent = gs1Data.params.length + ' 个参数';
    var table = $('gs1Table');
    table.innerHTML = '';
    gs1Data.params.forEach(function (p, idx) {
      var row = document.createElement('div');
      row.className = 'gs1-row' + (p.enabled ? '' : ' disabled');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = p.enabled; cb.className = 'gs1-enabled';
      cb.setAttribute('aria-label', '启用此参数');
      cb.addEventListener('change', function () { p.enabled = cb.checked; gs1TableChanged(); });
      var ai = document.createElement('input');
      ai.type = 'text'; ai.value = p.ai; ai.className = 'gs1-ai';
      ai.setAttribute('aria-label', 'AI 代码');
      ai.addEventListener('change', function () { p.ai = ai.value.trim(); updateGs1Name(row, p); gs1TableChanged(); });
      var name = document.createElement('span');
      name.className = 'gs1-name';
      var nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.className = 'gs1-name-input';
      nameInput.setAttribute('aria-label', 'AI 显示名称，点一下可改');
      nameInput.addEventListener('change', function () {
        saveGs1CustomName(p.ai, nameInput.value.trim());
        updateGs1Name(row, p);
      });
      var dateSpan = document.createElement('span');
      dateSpan.className = 'gs1-date';
      name.appendChild(nameInput); name.appendChild(dateSpan);
      var val = document.createElement('input');
      val.type = 'text'; val.value = p.value; val.className = 'gs1-value';
      val.setAttribute('aria-label', '参数值');
      val.addEventListener('change', function () { p.value = val.value; updateGs1Name(row, p); gs1TableChanged(); });
      var del = document.createElement('button');
      del.className = 'btn ghost small gs1-del'; del.textContent = '×'; del.title = '删除此参数';
      del.addEventListener('click', function () { gs1Data.params.splice(idx, 1); gs1TableChanged(); });
      row.appendChild(cb); row.appendChild(ai); row.appendChild(name); row.appendChild(val); row.appendChild(del);
      updateGs1Name(row, p);
      table.appendChild(row);
    });
  }

  function updateGs1Panel() {
    if (gs1FromTable) return;
    var text = state.text;
    if (gs1DismissedText === text) { $('gs1Panel').hidden = true; $('gs1Divider').hidden = true; return; }
    gs1Data = parseGs1(text);
    renderGs1Table();
  }

  function gs1TableChanged() {
    var text = rebuildGs1(gs1Data);
    gs1FromTable = true;
    setText(text);
    renderGs1Table();
    render();
    gs1FromTable = false;
  }

  function fileName(ext) {
    return (currentFormat() === 'qrcode' ? 'qrcode' : 'barcode') + '.' + ext;
  }

  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- 生成历史：只记文本，点一条重新生成（本机保存，最多 5 条，7 天过期） ---------- */
  var QR_HISTORY_KEY = 'qr-wb-qr-history';
  var QR_HISTORY_TTL = 7 * 24 * 3600 * 1000;
  var QR_HISTORY_MAX = 5;
  function loadQrHistoryRaw() {
    try {
      var raw = localStorage.getItem(QR_HISTORY_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      var now = Date.now(), out = [];
      arr.forEach(function (it) {
        if (typeof it === 'string') { out.push({ t: now, v: it }); return; }
        if (it && typeof it.v === 'string' && typeof it.t === 'number' && now - it.t <= QR_HISTORY_TTL) out.push(it);
      });
      return out;
    } catch (e) { return []; }
  }
  function renderQrHistory() {
    var items = loadQrHistoryRaw();
    var panel = $('qrHistoryPanel');
    if (!items.length) { panel.hidden = true; return; }
    panel.hidden = false;
    var list = $('qrHistoryList');
    list.innerHTML = '';
    items.forEach(function (it) {
      var btn = document.createElement('button');
      btn.className = 'qr-history-item';
      btn.title = it.v + '（点击重新生成）';
      btn.textContent = it.v;
      btn.addEventListener('click', function () {
        setText(it.v);
        gs1DismissedText = null;
        render();
        updateGs1Panel();
        saveQrHistory(it.v);
      });
      list.appendChild(btn);
    });
  }
  function saveQrHistory(text) {
    if (!text || !text.trim()) return;
    try {
      var items = loadQrHistoryRaw().filter(function (it) { return it.v !== text; });
      items.unshift({ k: 'qr-wb-qr-history', t: Date.now(), v: text });
      localStorage.setItem(QR_HISTORY_KEY, JSON.stringify(items.slice(0, QR_HISTORY_MAX)));
      renderQrHistory();
    } catch (e) {}
  }
  function clearQrHistory() {
    try { localStorage.removeItem(QR_HISTORY_KEY); } catch (e) {}
    renderQrHistory();
    showToast('生成历史已清空');
  }

  /* ---------- 按钮动作（模板 @click 调） ---------- */
  function doGenerate() { render(); updateGs1Panel(); saveQrHistory(state.text); }

  function loadSample() {
    var fmt = currentFormat();
    setText(FORMATS[fmt].sample);
    render();
    updateGs1Panel();
    saveQrHistory(FORMATS[fmt].sample);
    $('qrInput').focus();
  }

  function clearInput() {
    setText('');
    render();
    updateGs1Panel();
    $('qrInput').focus();
  }

  function closeGs1() {
    gs1DismissedText = state.text;
    $('gs1Panel').hidden = true;
    $('gs1Divider').hidden = true;
  }

  function resetGs1Names() {
    try { localStorage.removeItem(GS1_NAMES_KEY); } catch (e) {}
    renderGs1Table();
    showToast('AI 显示名称已恢复默认');
  }

  /* GS1 示例：用一组真实参数载入示例链接，参数表与二维码一起生成，方便测试 */
  var GS1_SAMPLE = 'https://example.com/01/09506000134352/10/LOT2026A/21/SN100001?17=261231&30=12';
  function loadGs1Sample() {
    setText(GS1_SAMPLE);
    gs1DismissedText = null;
    render();
    updateGs1Panel();
    saveQrHistory(GS1_SAMPLE);
    $('qrInput').focus();
  }

  /* 导入模板 URL：粘贴一条 GS1 链接当模板，载入输入框并解析参数；模板存在本机，下次打开还在导入框里 */
  var GS1_TEMPLATE_KEY = 'qr-wb-gs1-template';
  try {
    var savedTpl = localStorage.getItem(GS1_TEMPLATE_KEY);
    if (savedTpl) $('gs1TemplateInput').value = savedTpl;
  } catch (e) {}
  function importGs1Template() {
    var url = $('gs1TemplateInput').value.trim();
    if (!url) { showToast('先在导入框里粘贴一条模板 URL'); return; }
    try { localStorage.setItem(GS1_TEMPLATE_KEY, url); } catch (e) {}
    setText(url);
    gs1DismissedText = null;
    render();
    updateGs1Panel();
    saveQrHistory(url);
    $('qrInput').focus();
  }

  function addGs1Param() {
    var ai = $('gs1NewAi').value.trim();
    var value = $('gs1NewValue').value;
    if (!ai) { showToast('先填 AI 代码，如 10'); return; }
    if (!/^\d{2,4}$/.test(ai)) { showToast('AI 代码是 2–4 位数字'); return; }
    if (!gs1Data) gs1Data = { kind: 'element', params: [] };
    gs1Data.params.push({ ai: ai, value: value, from: gs1Data.kind === 'url' ? 'query' : 'element', enabled: true });
    $('gs1NewAi').value = '';
    $('gs1NewValue').value = '';
    gs1TableChanged();
  }

  function downloadPng() {
    var canvas = $('qrCanvas');
    if (canvas.hidden) { showToast('没有可下载的内容，先生成一个'); return; }
    canvas.toBlob(function (blob) {
      if (!blob) { showToast('下载失败'); return; }
      downloadBlob(blob, fileName('png'));
      showToast('已下载 ' + fileName('png'));
    }, 'image/png');
  }

  function downloadSvg() {
    if ($('qrCanvas').hidden) { showToast('没有可下载的内容，先生成一个'); return; }
    try {
      var svg;
      if (currentFormat() === 'qrcode') {
        var target = (SIZE_MAP[state.scale] || SIZE_MAP.medium).qr;
        svg = qrSvgExact(buildOpts(), target);
      } else {
        svg = bwipjs.toSVG(buildOpts());
      }
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), fileName('svg'));
      showToast('已下载 ' + fileName('svg'));
    } catch (e) {
      showToast(friendlyError(e));
    }
  }

  function copyImage() {
    var canvas = $('qrCanvas');
    if (canvas.hidden) { showToast('没有可复制的内容，先生成一个'); return; }
    if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) {
      showToast('当前浏览器不支持复制图片，改用下载 PNG');
      return;
    }
    canvas.toBlob(function (blob) {
      if (!blob) { showToast('复制失败'); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(
        function () { showToast('已复制图片'); },
        function () { showToast('复制失败，改用下载 PNG'); }
      );
    }, 'image/png');
  }

  /* ---------- Vue 3 应用 ---------- */
  /* 控件联动：v-model 写 state，flush:'sync' 的 watcher 同步跑原来的保存 + 生成，
     所以测试同步读 DOM 时已经是新值。输入框改动时立即同步生成（取代原来的 300ms 防抖，
     生成是同步的，测试点「生成」前也已是最新状态）。 */
  var app = Vue.createApp({
    data: function () { return state; },
    watch: {
      theme: { handler: function (t) { if (suppressWatch) return; applyTheme(t); }, flush: 'sync' },
      format: { handler: function () { if (suppressWatch) return; updateFormatUI(); render(); }, flush: 'sync' },
      text: { handler: function () {
        if (suppressWatch) return;
        updateInputStats();
        render();
        updateGs1Panel();
      }, flush: 'sync' },
      scale: { handler: function () {
        if (suppressWatch) return;
        try { localStorage.setItem(SIZE_KEY, state.scale); } catch (e) {}
        render();
      }, flush: 'sync' },
      ec: { handler: function () { if (suppressWatch) return; render(); }, flush: 'sync' },
      showText: { handler: function () { if (suppressWatch) return; render(); }, flush: 'sync' },
      fgColor: { handler: function () { if (suppressWatch) return; render(); }, flush: 'sync' },
      bgColor: { handler: function () { if (suppressWatch) return; render(); }, flush: 'sync' }
    },
    methods: {
      generate: doGenerate,
      render: render,
      loadSample: loadSample,
      loadGs1Sample: loadGs1Sample,
      clearInput: clearInput,
      closeGs1: closeGs1,
      resetGs1Names: resetGs1Names,
      importGs1Template: importGs1Template,
      addGs1Param: addGs1Param,
      clearQrHistory: clearQrHistory,
      downloadPng: downloadPng,
      downloadSvg: downloadSvg,
      copyImage: copyImage,
      toggleBrand: toggleBrand,
      onBrandMenuClick: onBrandMenuClick
    },
    mounted: function () {
      document.addEventListener('click', function (e) {
        if (!$('brandMenu').hidden && !e.target.closest('.brand-wrap')) closeBrand();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeBrand();
      });
      initResizer();
      initGs1Divider();
      var theme = 'dark';
      try { theme = localStorage.getItem('json-wb-theme') || 'dark'; } catch (e) {}
      suppressWatch = true;
      applyTheme(theme);
      suppressWatch = false;
      updateFormatUI();
      renderQrHistory();
    }
  });
  app.mount('#app');
})();
