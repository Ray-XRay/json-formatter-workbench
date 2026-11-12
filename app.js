/* JSON 格式化工作台 — app.js */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var input = $('input');
  var output = $('output');
  var tree = $('tree');
  var gutter = $('inputGutter');
  var statusDot = $('statusDot');
  var statusText = $('statusText');
  var inputStats = $('inputStats');
  var outputStats = $('outputStats');
  var detailStats = $('detailStats');
  var toastEl = $('toast');

  var lastValue = null;      // 最近一次解析成功的 JS 值
  var lastFormatted = '';    // 最近一次输出的字符串
  var currentView = 'code';  // 'code' | 'tree'

  /* ---------- 工具 ---------- */
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }

  function setStatus(kind, text) {
    statusDot.className = 'dot ' + (kind || 'idle');
    statusText.textContent = text;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getIndent() {
    var v = $('indentSelect').value;
    return v === 'tab' ? '\t' : Number(v);
  }

  /* 递归按键名排序 */
  function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).sort().forEach(function (k) { out[k] = sortDeep(value[k]); });
      return out;
    }
    return value;
  }

  /* 统计：键总数、最大深度 */
  function analyze(value) {
    var keys = 0, depth = 0;
    (function walk(v, d) {
      if (d > depth) depth = d;
      if (Array.isArray(v)) {
        v.forEach(function (item) { walk(item, d + 1); });
      } else if (v && typeof v === 'object') {
        Object.keys(v).forEach(function (k) { keys++; walk(v[k], d + 1); });
      }
    })(value, 1);
    return { keys: keys, depth: depth };
  }

  /* 从报错信息里提取 position，再换算行列 */
  function errorPosition(text, err) {
    var m = /position (\d+)/.exec(err.message);
    if (!m) {
      m = /line (\d+) column (\d+)/.exec(err.message);
      if (m) return { line: Number(m[1]), col: Number(m[2]), pos: -1 };
      return null;
    }
    var pos = Number(m[1]);
    var before = text.slice(0, pos);
    var lines = before.split('\n');
    return { line: lines.length, col: lines[lines.length - 1].length + 1, pos: pos };
  }

  /* ---------- 语法高亮 ---------- */
  function highlight(json) {
    var re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    var out = '', last = 0, m;
    while ((m = re.exec(json))) {
      out += escapeHtml(json.slice(last, m.index));
      if (m[1] !== undefined) {
        out += m[2]
          ? '<span class="k">' + escapeHtml(m[1]) + '</span>:'
          : '<span class="s">' + escapeHtml(m[1]) + '</span>';
      } else if (m[3] !== undefined) {
        out += '<span class="b">' + m[3] + '</span>';
      } else if (m[0] === 'null') {
        out += '<span class="u">null</span>';
      } else {
        out += '<span class="n">' + m[0] + '</span>';
      }
      last = re.lastIndex;
    }
    out += escapeHtml(json.slice(last));
    return out;
  }

  /* ---------- 树形视图 ---------- */
  function typeLabel(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array · ' + v.length + ' 项';
    if (typeof v === 'object') return 'object · ' + Object.keys(v).length + ' 键';
    return typeof v;
  }

  function leafHtml(v) {
    if (typeof v === 'string') return '<span class="tree-val tree-str">"' + escapeHtml(v) + '"</span>';
    if (typeof v === 'number') return '<span class="tree-val tree-num">' + v + '</span>';
    if (typeof v === 'boolean') return '<span class="tree-val tree-bool">' + v + '</span>';
    return '<span class="tree-val tree-null">null</span>';
  }

  function renderTree(value, key) {
    var wrap = document.createElement('div');
    wrap.className = 'tree-node';

    var isObj = value !== null && typeof value === 'object';
    var keyHtml = (key === undefined) ? '' : '<span class="tree-key">"' + escapeHtml(key) + '"</span>: ';

    if (!isObj) {
      wrap.innerHTML = '<span class="tree-leaf">' + keyHtml + leafHtml(value) + '</span>';
      wrap.querySelector('.tree-leaf').addEventListener('click', function () {
        copyText(String(value));
      });
      wrap.title = '点击复制该值';
      return wrap;
    }

    var entries = Array.isArray(value)
      ? value.map(function (v, i) { return [i, v]; })
      : Object.keys(value).map(function (k) { return [k, value[k]]; });

    var open = document.createElement('span');
    open.textContent = Array.isArray(value) ? '[' : '{';
    var close = document.createElement('span');
    close.textContent = Array.isArray(value) ? ']' : '}';

    var head = document.createElement('div');
    var toggle = document.createElement('button');
    toggle.className = 'tree-toggle';
    toggle.textContent = '▾';
    var label = document.createElement('span');
    label.innerHTML = keyHtml + '<span class="tree-type">' + typeLabel(value) + '</span>';
    head.appendChild(toggle);
    head.appendChild(label);
    if (entries.length === 0) {
      head.appendChild(open);
      head.appendChild(close);
    } else {
      head.appendChild(open);
    }
    wrap.appendChild(head);

    if (entries.length > 0) {
      var children = document.createElement('div');
      children.className = 'tree-children';
      entries.forEach(function (kv, idx) {
        var child = renderTree(kv[1], Array.isArray(value) ? undefined : kv[0]);
        if (idx < entries.length - 1) {
          var comma = document.createElement('span');
          comma.textContent = ',';
          child.appendChild(comma);
        }
        children.appendChild(child);
      });
      wrap.appendChild(children);
      var tail = document.createElement('div');
      tail.appendChild(close);
      wrap.appendChild(tail);

      toggle.addEventListener('click', function () {
        var collapsed = children.style.display === 'none';
        children.style.display = collapsed ? '' : 'none';
        tail.style.display = collapsed ? '' : 'none';
        toggle.textContent = collapsed ? '▾' : '▸';
      });
    }
    return wrap;
  }

  function renderTreeView() {
    tree.innerHTML = '';
    if (lastValue === null && lastFormatted === '') return;
    tree.appendChild(renderTree(lastValue));
  }

  /* ---------- 视图切换 ---------- */
  function setView(view) {
    currentView = view;
    $('viewCode').classList.toggle('active', view === 'code');
    $('viewTree').classList.toggle('active', view === 'tree');
    output.hidden = view !== 'code';
    tree.hidden = view !== 'tree';
    if (view === 'tree') renderTreeView();
  }

  /* ---------- 核心操作 ---------- */
  function parseInput() {
    var text = input.value;
    if (!text.trim()) {
      setStatus('warn', '输入为空，请粘贴 JSON');
      return null;
    }
    try {
      var value = JSON.parse(text);
      return { value: value, text: text };
    } catch (e) {
      var pos = errorPosition(text, e);
      var msg = 'JSON 无效：' + e.message;
      if (pos) msg += '（第 ' + pos.line + ' 行，第 ' + pos.col + ' 列）';
      setStatus('err', msg);
      output.innerHTML = '<code>' + escapeHtml(text) + '</code>';
      outputStats.textContent = '解析失败';
      detailStats.textContent = '';
      return null;
    }
  }

  function applyResult(value, mode) {
    var v = $('sortKeys').checked ? sortDeep(value) : value;
    var formatted = mode === 'minify'
      ? JSON.stringify(v)
      : JSON.stringify(v, null, getIndent());
    lastValue = v;
    lastFormatted = formatted;
    output.innerHTML = '<code>' + highlight(formatted) + '</code>';
    var st = analyze(v);
    outputStats.textContent = formatted.length + ' 字符';
    detailStats.textContent = '键 ' + st.keys + ' 个 · 最大深度 ' + st.depth + ' 层';
    setStatus('ok', mode === 'minify' ? '已压缩' : '格式化成功');
    if (currentView === 'tree') renderTreeView();
  }

  function doFormat() {
    var r = parseInput();
    if (r) applyResult(r.value, 'format');
  }

  function doMinify() {
    var r = parseInput();
    if (r) applyResult(r.value, 'minify');
  }

  function doValidate() {
    var r = parseInput();
    if (!r) return;
    var st = analyze(r.value);
    lastValue = r.value;
    lastFormatted = r.text;
    setStatus('ok', 'JSON 有效 · 键 ' + st.keys + ' 个 · 最大深度 ' + st.depth + ' 层');
    outputStats.textContent = '有效';
    detailStats.textContent = '键 ' + st.keys + ' 个 · 最大深度 ' + st.depth + ' 层';
    if (currentView === 'tree') renderTreeView();
  }

  /* ---------- 输入框行号 ---------- */
  function updateGutter() {
    var lines = input.value.split('\n').length;
    var s = '';
    for (var i = 1; i <= lines; i++) s += i + '\n';
    gutter.textContent = s;
    inputStats.textContent = input.value.length + ' 字符';
    gutter.scrollTop = input.scrollTop;
  }

  /* ---------- 复制 / 下载 ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { showToast('已复制到剪贴板'); },
        function () { fallbackCopy(text); }
      );
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('已复制到剪贴板'); }
    catch (e) { showToast('复制失败，请手动选择复制'); }
    document.body.removeChild(ta);
  }

  function downloadJson() {
    if (!lastFormatted) { showToast('没有可下载的内容，先格式化一次'); return; }
    var blob = new Blob([lastFormatted], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'formatted.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    showToast('已下载 formatted.json');
  }

  /* ---------- 示例 ---------- */
  var SAMPLE = {
    name: 'JSON 格式化工作台',
    version: 1,
    features: ['格式化', '压缩', '验证', '树形浏览'],
    options: { indent: 2, sortKeys: false, autoFormatOnPaste: true },
    stats: { keys: 128, depth: 4 },
    active: true,
    note: null
  };

  /* ---------- 事件绑定 ---------- */
  $('btnFormat').addEventListener('click', doFormat);
  $('btnMinify').addEventListener('click', doMinify);
  $('btnValidate').addEventListener('click', doValidate);
  $('viewCode').addEventListener('click', function () { setView('code'); });
  $('viewTree').addEventListener('click', function () {
    if (lastValue === null) { showToast('先格式化或验证一次，再看树形视图'); return; }
    setView('tree');
  });

  $('btnCopy').addEventListener('click', function () {
    if (!lastFormatted) { showToast('没有可复制的内容，先格式化一次'); return; }
    copyText(lastFormatted);
  });
  $('btnDownload').addEventListener('click', downloadJson);

  $('btnClear').addEventListener('click', function () {
    input.value = '';
    lastValue = null;
    lastFormatted = '';
    output.innerHTML = '<code>格式化后的 JSON 会显示在这里。</code>';
    tree.innerHTML = '';
    outputStats.textContent = '等待输入';
    detailStats.textContent = '';
    setStatus('idle', '已清空');
    updateGutter();
    input.focus();
  });

  $('btnSample').addEventListener('click', function () {
    input.value = JSON.stringify(SAMPLE, null, 2);
    updateGutter();
    doFormat();
  });

  $('btnPaste').addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) {
        if (!text) { showToast('剪贴板是空的'); return; }
        input.value = text;
        updateGutter();
        if ($('formatOnPaste').checked) doFormat();
        else setStatus('idle', '已粘贴，点击「格式化」处理');
      }, function () {
        showToast('浏览器不允许直接读取剪贴板，请用 Ctrl+V 粘贴');
        input.focus();
      });
    } else {
      showToast('浏览器不支持直接读取剪贴板，请用 Ctrl+V 粘贴');
      input.focus();
    }
  });

  $('btnUpload').addEventListener('click', function () { $('fileInput').click(); });
  $('fileInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      input.value = String(reader.result);
      updateGutter();
      if ($('formatOnPaste').checked) doFormat();
      else setStatus('idle', '已载入 ' + file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* 拖放 .json 文件 */
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      input.value = String(reader.result);
      updateGutter();
      doFormat();
    };
    reader.readAsText(file);
  });

  input.addEventListener('input', updateGutter);
  input.addEventListener('scroll', function () { gutter.scrollTop = input.scrollTop; });
  input.addEventListener('paste', function () {
    setTimeout(function () {
      updateGutter();
      if ($('formatOnPaste').checked) doFormat();
    }, 0);
  });
  input.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doFormat(); }
  });

  updateGutter();
})();
