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

  /* ---------- 各类型说明、示例 ---------- */
  var FORMATS = {
    qrcode: { label: 'QR Code', hint: '网址、文字都行，中文也可以。纠错级别越高越耐脏、耐遮挡，但码点越密。生成尺寸固定为小 / 中 / 大，不随内容变长而变大。', sample: 'https://example.com', twoDim: true },
    code128: { label: '条码', hint: '字母、数字和符号都行，最常用的一维条码。', sample: 'HELLO-12345', oneDim: true }
  };

  /* 大小档：二维码按目标尺寸固定输出（小 200 / 中 300 / 大 400 px，不随内容变长而变大）；
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

  /* 二维码固定尺寸：先以 scale 1 量出模块数（含静区），再算出刚好塞进目标尺寸的倍率 */
  function finalOpts() {
    var opts = buildOpts();
    if (currentFormat() === 'qrcode') {
      var probe = document.createElement('canvas');
      bwipjs.toCanvas(probe, { bcid: 'qrcode', text: opts.text, scale: 1, eclevel: opts.eclevel, backgroundcolor: opts.backgroundcolor, barcolor: opts.barcolor, textcolor: opts.textcolor });
      var target = (SIZE_MAP[$('scaleSelect').value] || SIZE_MAP.medium).qr;
      opts.scale = Math.max(1, Math.floor(target / probe.width));
    }
    return opts;
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
      bwipjs.toCanvas(canvas, finalOpts());
      canvas.hidden = false;
      $('qrEmpty').hidden = true;
      var fmt = currentFormat();
      $('qrStats').textContent = FORMATS[fmt].label + ' · ' + canvas.width + ' × ' + canvas.height + ' px';
      $('detailStats').textContent = text.length + ' 字符';
      setStatus('ok', '已生成');
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
    debounceTimer = setTimeout(render, 300);
  });

  $('formatSelect').addEventListener('change', function () { updateFormatUI(); render(); });
  $('scaleSelect').addEventListener('change', render);
  $('ecSelect').addEventListener('change', render);
  $('showText').addEventListener('change', render);
  $('fgColor').addEventListener('input', render);
  $('bgColor').addEventListener('input', render);

  $('btnGenerate').addEventListener('click', render);

  $('btnSample').addEventListener('click', function () {
    var fmt = currentFormat();
    $('qrInput').value = FORMATS[fmt].sample;
    $('inputStats').textContent = FORMATS[fmt].sample.length + ' 字符';
    render();
    $('qrInput').focus();
  });

  $('btnClear').addEventListener('click', function () {
    $('qrInput').value = '';
    $('inputStats').textContent = '0 字符';
    render();
    $('qrInput').focus();
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
      var svg = bwipjs.toSVG(finalOpts());
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
