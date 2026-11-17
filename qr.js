/* 二维码 / 条码生成器：bwip-js（本地 vendor）渲染到 canvas。
   纯静态零后端；格式、纠错级别、颜色都在本页改，生成即所见。 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

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

  /* ---------- 主题（与格式化页共用 json-wb-theme） ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var sel = $('themeSelect');
    if (sel) sel.value = theme;
    try { localStorage.setItem('json-wb-theme', theme); } catch (e) {}
  }
  $('themeSelect').addEventListener('change', function () { applyTheme(this.value); });

  /* 顶栏品牌切换：点左上角品牌块打开工具下拉 */
  var brandBtn = $('brandBtn'), brandMenu = $('brandMenu');
  function closeBrand() {
    brandMenu.hidden = true;
    brandBtn.setAttribute('aria-expanded', 'false');
  }
  brandBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    brandMenu.hidden = !brandMenu.hidden;
    brandBtn.setAttribute('aria-expanded', String(!brandMenu.hidden));
  });
  document.addEventListener('click', function (e) {
    if (!brandMenu.hidden && !e.target.closest('.brand-wrap')) closeBrand();
  });
  brandMenu.addEventListener('click', function (e) {
    var item = e.target.closest('.brand-item');
    if (!item) return;
    var page = item.getAttribute('data-page');
    closeBrand();
    if (page && page !== 'qr.html') location.href = page;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeBrand();
  });

  /* ---------- 可拖动分隔条（与格式化页同款，比例分开存） ---------- */
  (function initResizer() {
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
  })();

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

  function currentFormat() { return $('formatSelect').value; }
  function hexNoHash(v) { return v.replace('#', ''); }

  function buildOpts() {
    var fmt = currentFormat();
    var size = SIZE_MAP[$('scaleSelect').value] || SIZE_MAP.medium;
    var opts = {
      bcid: fmt,
      text: $('qrInput').value,
      backgroundcolor: hexNoHash($('bgColor').value),
      barcolor: hexNoHash($('fgColor').value),
      textcolor: hexNoHash($('fgColor').value)
    };
    if (FORMATS[fmt].oneDim) {
      opts.height = 10;
      opts.includetext = $('showText').checked;
      opts.scale = size.barcodeScale;
    }
    if (fmt === 'qrcode') opts.eclevel = $('ecSelect').value;
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
    var text = $('qrInput').value;
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
        target = (SIZE_MAP[$('scaleSelect').value] || SIZE_MAP.medium).qr;
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
    if (!gs1Data || !gs1Data.params.length) { panel.hidden = true; return; }
    panel.hidden = false;
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
    var text = $('qrInput').value;
    if (gs1DismissedText === text) { $('gs1Panel').hidden = true; return; }
    gs1Data = parseGs1(text);
    renderGs1Table();
  }

  function gs1TableChanged() {
    var text = rebuildGs1(gs1Data);
    gs1FromTable = true;
    $('qrInput').value = text;
    $('inputStats').textContent = text.length + ' 字符';
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

  /* ---------- 事件 ---------- */
  var debounceTimer = null;
  $('qrInput').addEventListener('input', function () {
    $('inputStats').textContent = this.value.length + ' 字符';
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { render(); updateGs1Panel(); }, 300);
  });

  $('formatSelect').addEventListener('change', function () { updateFormatUI(); render(); });
  $('scaleSelect').addEventListener('change', render);
  $('ecSelect').addEventListener('change', render);
  $('showText').addEventListener('change', render);
  $('fgColor').addEventListener('input', render);
  $('bgColor').addEventListener('input', render);

  $('btnGenerate').addEventListener('click', function () { render(); updateGs1Panel(); });

  $('btnSample').addEventListener('click', function () {
    var fmt = currentFormat();
    $('qrInput').value = FORMATS[fmt].sample;
    $('inputStats').textContent = FORMATS[fmt].sample.length + ' 字符';
    render();
    updateGs1Panel();
    $('qrInput').focus();
  });

  $('btnClear').addEventListener('click', function () {
    $('qrInput').value = '';
    $('inputStats').textContent = '0 字符';
    render();
    updateGs1Panel();
    $('qrInput').focus();
  });

  $('btnGs1Close').addEventListener('click', function () {
    gs1DismissedText = $('qrInput').value;
    $('gs1Panel').hidden = true;
  });

  $('btnGs1ResetNames').addEventListener('click', function () {
    try { localStorage.removeItem(GS1_NAMES_KEY); } catch (e) {}
    renderGs1Table();
    showToast('AI 显示名称已恢复默认');
  });

  /* GS1 示例：用一组真实参数载入示例链接，参数表与二维码一起生成，方便测试 */
  var GS1_SAMPLE = 'https://example.com/01/09506000134352/10/LOT2026A/21/SN100001?17=261231&30=12';
  $('btnGs1Sample').addEventListener('click', function () {
    $('qrInput').value = GS1_SAMPLE;
    $('inputStats').textContent = GS1_SAMPLE.length + ' 字符';
    gs1DismissedText = null;
    render();
    updateGs1Panel();
    $('qrInput').focus();
  });

  $('btnGs1Add').addEventListener('click', function () {
    var ai = $('gs1NewAi').value.trim();
    var value = $('gs1NewValue').value;
    if (!ai) { showToast('先填 AI 代码，如 10'); return; }
    if (!/^\d{2,4}$/.test(ai)) { showToast('AI 代码是 2–4 位数字'); return; }
    if (!gs1Data) gs1Data = { kind: 'element', params: [] };
    gs1Data.params.push({ ai: ai, value: value, from: gs1Data.kind === 'url' ? 'query' : 'element', enabled: true });
    $('gs1NewAi').value = '';
    $('gs1NewValue').value = '';
    gs1TableChanged();
  });

  $('btnDownloadPng').addEventListener('click', function () {
    var canvas = $('qrCanvas');
    if (canvas.hidden) { showToast('没有可下载的内容，先生成一个'); return; }
    canvas.toBlob(function (blob) {
      if (!blob) { showToast('下载失败'); return; }
      downloadBlob(blob, fileName('png'));
      showToast('已下载 ' + fileName('png'));
    }, 'image/png');
  });

  $('btnDownloadSvg').addEventListener('click', function () {
    if ($('qrCanvas').hidden) { showToast('没有可下载的内容，先生成一个'); return; }
    try {
      var svg;
      if (currentFormat() === 'qrcode') {
        var target = (SIZE_MAP[$('scaleSelect').value] || SIZE_MAP.medium).qr;
        svg = qrSvgExact(buildOpts(), target);
      } else {
        svg = bwipjs.toSVG(buildOpts());
      }
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), fileName('svg'));
      showToast('已下载 ' + fileName('svg'));
    } catch (e) {
      showToast(friendlyError(e));
    }
  });

  $('btnCopyImage').addEventListener('click', function () {
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
  });

  /* ---------- 初始化 ---------- */
  var theme = 'dark';
  try { theme = localStorage.getItem('json-wb-theme') || 'dark'; } catch (e) {}
  applyTheme(theme);
  updateFormatUI();
})();
