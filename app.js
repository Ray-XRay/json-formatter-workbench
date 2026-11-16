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
  var panes = $('panes');
  var paneLeft = $('paneLeft');
  var divider = $('divider');

  var lastValue = null;      // 最近一次解析成功的 JS 值
  var lastFormatted = '';    // 当前输出区文本
  var lastDownloadName = 'formatted.json';
  var outputMode = 'json';   // 'json' | 'ts' | 'text'
  var currentView = 'code';  // 'code' | 'tree'

  /* ---------- 通用 ---------- */
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

  /* ---------- 主题 ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var sel = $('themeSelect');
    if (sel) sel.value = theme;
    try { localStorage.setItem('json-wb-theme', theme); } catch (e) {}
  }

  $('themeSelect').addEventListener('change', function () {
    applyTheme(this.value);
  });

  /* ---------- 可拖动分隔条 ---------- */
  function initResizer() {
    var saved = null;
    try { saved = localStorage.getItem('json-wb-split'); } catch (e) {}
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
        var pct;
        if (vertical) {
          pct = (startH + (ev.clientY - startY)) / rect.height * 100;
          paneLeft.style.height = Math.min(75, Math.max(25, pct)) + '%';
        } else {
          pct = (startW + (ev.clientX - startX)) / rect.width * 100;
          pct = Math.min(75, Math.max(25, pct));
          paneLeft.style.width = pct + '%';
        }
      }
      function onUp() {
        divider.classList.remove('dragging');
        divider.removeEventListener('pointermove', onMove);
        divider.removeEventListener('pointerup', onUp);
        try {
          if (vertical) {
            localStorage.setItem('json-wb-split-v', paneLeft.style.height);
          } else {
            localStorage.setItem('json-wb-split', parseFloat(paneLeft.style.width));
          }
        } catch (err) {}
      }
      divider.addEventListener('pointermove', onMove);
      divider.addEventListener('pointerup', onUp);
    });
  }

  /* ---------- 递归按键名排序 ---------- */
  function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).sort().forEach(function (k) { out[k] = sortDeep(value[k]); });
      return out;
    }
    return value;
  }

  /* ---------- 统计 ---------- */
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

  /* ---------- 报错行列定位 ---------- */
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
  /* 标点（{}[],:）单独着色，层次更丰富 */
  function punctHtml(s) {
    return escapeHtml(s).replace(/([{}\[\],:])/g, '<span class="p">$1</span>');
  }

  function highlight(json) {
    var re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    var out = '', last = 0, m;
    while ((m = re.exec(json))) {
      out += punctHtml(json.slice(last, m.index));
      if (m[1] !== undefined) {
        out += m[2]
          ? '<span class="k">' + escapeHtml(m[1]) + '</span>' + m[2].replace(':', '<span class="p">:</span>')
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
    out += punctHtml(json.slice(last));
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
      tail.className = 'tree-tail';
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

  /* 展开全部树节点（Ctrl+L） */
  function expandAllTree() {
    if (tree.hidden) return false;
    tree.querySelectorAll('.tree-children').forEach(function (el) { el.style.display = ''; });
    tree.querySelectorAll('.tree-tail').forEach(function (el) { el.style.display = ''; });
    tree.querySelectorAll('.tree-toggle').forEach(function (el) { el.textContent = '▾'; });
    return true;
  }

  /* 折叠全部树节点 */
  function collapseAllTree() {
    if (tree.hidden) return false;
    tree.querySelectorAll('.tree-children').forEach(function (el) { el.style.display = 'none'; });
    tree.querySelectorAll('.tree-tail').forEach(function (el) { el.style.display = 'none'; });
    tree.querySelectorAll('.tree-toggle').forEach(function (el) { el.textContent = '▸'; });
    return true;
  }

  /* 展开 / 折叠全部节点（再按一次合上） */
  function toggleAllTree() {
    if (tree.hidden || currentView !== 'tree') return;
    var anyCollapsed = false;
    tree.querySelectorAll('.tree-children').forEach(function (el) {
      if (el.style.display === 'none') anyCollapsed = true;
    });
    if (anyCollapsed) { expandAllTree(); showToast('已展开全部节点'); }
    else { collapseAllTree(); showToast('已折叠全部节点'); }
  }

  /* 选中当前输出区（代码、树形或对比）的内容 */
  function selectResult() {
    if (!lastFormatted) return;
    var target;
    if (!$('diffView').hidden) target = $('diffView');
    else if (currentView === 'tree' && !tree.hidden) target = tree;
    else target = output.querySelector('code') || output;
    if (!target || !target.textContent.trim()) return;
    var sel = window.getSelection();
    sel.removeAllRanges();
    var range = document.createRange();
    range.selectNodeContents(target);
    sel.addRange(range);
    showToast(currentView === 'tree' ? '已选中树形内容' : '已选中格式化结果');
  }

  /* ---------- 视图切换 ---------- */
  function setView(view) {
    currentView = view;
    $('viewCode').classList.toggle('active', view === 'code');
    $('viewTree').classList.toggle('active', view === 'tree');
    $('diffView').hidden = true;
    output.hidden = view !== 'code';
    tree.hidden = view !== 'tree';
    if (view === 'tree') renderTreeView();
  }

  /* ---------- 输出显示 ---------- */
  function hideDiff() {
    $('diffView').hidden = true;
    if (currentView === 'code') output.hidden = false;
    else tree.hidden = false;
  }

  function showOutput(text, opts) {
    opts = opts || {};
    outputMode = opts.mode || 'json';
    lastFormatted = text;
    lastDownloadName = opts.download || 'formatted.json';
    hideDiff();
    if (outputMode === 'json') {
      output.innerHTML = '<code>' + highlight(text) + '</code>';
    } else {
      output.innerHTML = '<code>' + escapeHtml(text) + '</code>';
    }
    outputStats.textContent = opts.stats || (text.length + ' 字符');
    if (currentView === 'tree' && outputMode === 'json') renderTreeView();
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
    showOutput(formatted, { mode: 'json', download: 'formatted.json', stats: formatted.length + ' 字符' });
    var st = analyze(v);
    detailStats.textContent = '键 ' + st.keys + ' 个 · 最大深度 ' + st.depth + ' 层';
    setStatus('ok', mode === 'minify' ? '已压缩' : '格式化成功');
    saveHistory(input.value);
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
    outputMode = 'json';
    setStatus('ok', 'JSON 有效 · 键 ' + st.keys + ' 个 · 最大深度 ' + st.depth + ' 层');
    outputStats.textContent = '有效';
    detailStats.textContent = '键 ' + st.keys + ' 个 · 最大深度 ' + st.depth + ' 层';
    if (currentView === 'tree') renderTreeView();
    saveHistory(input.value);
  }

  /* ---------- JSON 修复 ---------- */
  function repairJson(text) {
    var out = '';
    var i = 0, n = text.length;
    var state = 'normal'; // normal | dstr | sstr | lineComment | blockComment
    while (i < n) {
      var c = text[i], nx = text[i + 1];
      if (state === 'normal') {
        if (c === '"') { state = 'dstr'; out += c; i++; }
        else if (c === "'") { state = 'sstr'; out += '"'; i++; }
        else if (c === '/' && nx === '/') { state = 'lineComment'; i += 2; }
        else if (c === '/' && nx === '*') { state = 'blockComment'; i += 2; }
        else { out += c; i++; }
      } else if (state === 'dstr') {
        out += c;
        if (c === '\\' && i + 1 < n) { out += text[i + 1]; i += 2; }
        else if (c === '"') { state = 'normal'; i++; }
        else i++;
      } else if (state === 'sstr') {
        if (c === '\\' && i + 1 < n) {
          var e = text[i + 1];
          if (e === "'") { out += "'"; i += 2; }
          else if (e === '"') { out += '\\"'; i += 2; }
          else { out += c + e; i += 2; }
        } else if (c === '"') { out += '\\"'; i++; }
        else if (c === "'") { out += '"'; state = 'normal'; i++; }
        else { out += c; i++; }
      } else if (state === 'lineComment') {
        if (c === '\n') { out += c; state = 'normal'; }
        i++;
      } else { // blockComment
        if (c === '*' && nx === '/') { state = 'normal'; i += 2; }
        else i++;
      }
    }
    // 未加引号的键加上引号
    out = out.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
    // 尾随逗号
    out = out.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(out);
  }

  function doRepair() {
    var text = input.value;
    if (!text.trim()) { showToast('输入为空，先粘贴 JSON'); return; }
    try {
      var value = repairJson(text);
      input.value = JSON.stringify(value, null, getIndent());
      updateGutter();
      applyResult(value, 'format');
      setStatus('ok', '已修复并格式化');
      showToast('已修复常见错误并格式化');
    } catch (e) {
      setStatus('err', '修复失败，仍无法解析：' + e.message);
      showToast('修复失败，请检查输入');
    }
  }

  /* ---------- JSONPath 查询 ---------- */
  function parseJsonPath(expr) {
    expr = expr.trim();
    if (!expr || expr[0] !== '$') return null;
    var tokens = [];
    var rest = expr.slice(1);
    var re = /\.\.([A-Za-z_$][A-Za-z0-9_$]*)|\.([A-Za-z_$][A-Za-z0-9_$]*)|\.\*|\['([^'\]]+)'\]|\["([^"\]]+)"\]|\[(\d+)\]|\[\*\]/g;
    var m, lastIdx = 0;
    while ((m = re.exec(rest))) {
      if (m.index !== lastIdx) return null;
      lastIdx = re.lastIndex;
      if (m[1] !== undefined) tokens.push({ t: 'recursive', key: m[1] });
      else if (m[2] !== undefined) tokens.push({ t: 'key', key: m[2] });
      else if (m[0] === '.*') tokens.push({ t: 'wildcard' });
      else if (m[3] !== undefined) tokens.push({ t: 'key', key: m[3] });
      else if (m[4] !== undefined) tokens.push({ t: 'key', key: m[4] });
      else if (m[5] !== undefined) tokens.push({ t: 'index', idx: Number(m[5]) });
      else if (m[0] === '[*]') tokens.push({ t: 'wildcard' });
    }
    if (lastIdx !== rest.length) return null;
    return tokens;
  }

  function evalJsonPath(root, tokens) {
    var current = [{ path: '$', value: root }];
    tokens.forEach(function (tok) {
      var next = [];
      current.forEach(function (item) {
        var v = item.value;
        if (tok.t === 'key') {
          if (v && typeof v === 'object' && !Array.isArray(v) && tok.key in v) {
            next.push({ path: item.path + '.' + tok.key, value: v[tok.key] });
          }
        } else if (tok.t === 'index') {
          if (Array.isArray(v) && tok.idx < v.length) {
            next.push({ path: item.path + '[' + tok.idx + ']', value: v[tok.idx] });
          }
        } else if (tok.t === 'wildcard') {
          if (Array.isArray(v)) {
            v.forEach(function (el, i) { next.push({ path: item.path + '[' + i + ']', value: el }); });
          } else if (v && typeof v === 'object') {
            Object.keys(v).forEach(function (k) { next.push({ path: item.path + '.' + k, value: v[k] }); });
          }
        } else if (tok.t === 'recursive') {
          (function walk(node, p) {
            if (node && typeof node === 'object') {
              if (!Array.isArray(node) && tok.key in node) {
                next.push({ path: p + '.' + tok.key, value: node[tok.key] });
              }
              if (Array.isArray(node)) {
                node.forEach(function (el, i) { walk(el, p + '[' + i + ']'); });
              } else {
                Object.keys(node).forEach(function (k) { walk(node[k], p + '.' + k); });
              }
            }
          })(v, item.path);
        }
      });
      current = next;
    });
    return current;
  }

  function doJsonPath() {
    var expr = $('jsonpathInput').value;
    var r = parseInput();
    if (!r) return;
    var tokens = parseJsonPath(expr);
    if (!tokens) {
      setStatus('err', 'JSONPath 表达式不支持，请用 $.a.b[0]、$..key、$.* 这类写法');
      return;
    }
    var matches = evalJsonPath(r.value, tokens);
    $('jpResults').hidden = false;
    $('jpResultsCount').textContent = '共 ' + matches.length + ' 个匹配';
    $('jsonpathCount').textContent = matches.length + ' 个匹配';
    var body = $('jpResultsBody');
    body.innerHTML = '';
    if (matches.length === 0) {
      body.innerHTML = '<div class="jp-empty">没有匹配到任何结果。</div>';
      setStatus('warn', 'JSONPath 查询完成，没有匹配');
      return;
    }
    matches.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'jp-row';
      var preview = JSON.stringify(m.value);
      if (preview.length > 120) preview = preview.slice(0, 120) + '…';
      row.innerHTML = '<span class="jp-path">' + escapeHtml(m.path) + '</span><span class="jp-val">' + escapeHtml(preview) + '</span>';
      row.title = '点击复制该值';
      row.addEventListener('click', function () { copyText(JSON.stringify(m.value, null, 2)); });
      body.appendChild(row);
    });
    setStatus('ok', 'JSONPath 查询完成，' + matches.length + ' 个匹配');
  }

  /* ---------- 生成 TypeScript 类型 ---------- */
  function tsTypeName(raw) {
    var s = String(raw).replace(/[^A-Za-z0-9_$]/g, '_');
    if (/^\d/.test(s)) s = '_' + s;
    return s.charAt(0).toUpperCase() + s.slice(1) || 'Item';
  }

  function generateTs(root) {
    var defs = [];
    var used = {};
    function uniqueName(base) {
      var name = base, i = 2;
      while (used[name]) { name = base + i; i++; }
      used[name] = true;
      return name;
    }
    function infer(v, name) {
      if (v === null) return 'null';
      if (Array.isArray(v)) {
        if (v.length === 0) return 'unknown[]';
        var elemTypes = [];
        v.forEach(function (el) {
          var t = infer(el, name + 'Item');
          if (elemTypes.indexOf(t) === -1) elemTypes.push(t);
        });
        return elemTypes.length === 1 ? elemTypes[0] + '[]' : '(' + elemTypes.join(' | ') + ')[]';
      }
      if (typeof v === 'object') {
        var iface = uniqueName(name);
        var keys = Object.keys(v);
        var lines = keys.map(function (k) {
          var t = infer(v[k], iface + tsTypeName(k));
          return '  ' + (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k)) + ': ' + t + ';';
        });
        defs.push('interface ' + iface + ' {\n' + lines.join('\n') + '\n}');
        return iface;
      }
      if (typeof v === 'string') return 'string';
      if (typeof v === 'number') return 'number';
      if (typeof v === 'boolean') return 'boolean';
      return 'unknown';
    }
    // 数组元素的对象：合并键，缺失的标可选
    function inferArrayOfObjects(arr, name) {
      var allKeys = [];
      arr.forEach(function (el) {
        if (el && typeof el === 'object' && !Array.isArray(el)) {
          Object.keys(el).forEach(function (k) { if (allKeys.indexOf(k) === -1) allKeys.push(k); });
        }
      });
      var iface = uniqueName(name);
      var lines = allKeys.map(function (k) {
        var present = arr.filter(function (el) { return el && typeof el === 'object' && k in el; }).length;
        var types = [];
        arr.forEach(function (el) {
          if (el && typeof el === 'object' && k in el) {
            var t = infer(el[k], iface + tsTypeName(k));
            if (types.indexOf(t) === -1) types.push(t);
          }
        });
        var optional = present < arr.length ? '?' : '';
        return '  ' + (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k)) + optional + ': ' + (types.join(' | ') || 'unknown') + ';';
      });
      defs.push('interface ' + iface + ' {\n' + lines.join('\n') + '\n}');
      return iface;
    }
    // 顶层是对象数组时走合并逻辑
    if (Array.isArray(root) && root.length > 0 && root.every(function (el) { return el && typeof el === 'object' && !Array.isArray(el); })) {
      var itemType = inferArrayOfObjects(root, 'Item');
      return defs.join('\n\n') + '\n\ntype Root = ' + itemType + '[];';
    }
    var top = infer(root, 'Root');
    if (top === 'Root') return defs.join('\n\n');
    return defs.join('\n\n') + (defs.length ? '\n\n' : '') + 'type Root = ' + top + ';';
  }

  function doGenerateType() {
    var r = parseInput();
    if (!r) return;
    var lang = $('typeLang').value;
    if (lang === 'go') {
      var go = generateGo(r.value);
      showOutput(go, { mode: 'go', download: 'types.go', stats: 'Go 结构体' });
      detailStats.textContent = '已生成 Go struct';
      setStatus('ok', '已生成 Go 结构体，可复制或下载');
    } else if (lang === 'py') {
      var py = generatePy(r.value);
      showOutput(py, { mode: 'py', download: 'models.py', stats: 'Python dataclass' });
      detailStats.textContent = '已生成 Python dataclass';
      setStatus('ok', '已生成 Python dataclass，可复制或下载');
    } else {
      var ts = generateTs(r.value);
      showOutput(ts, { mode: 'ts', download: 'types.ts', stats: 'TypeScript 类型' });
      detailStats.textContent = '已生成类型定义';
      setStatus('ok', '已生成 TypeScript 类型，可复制或下载');
    }
  }

  /* ---------- 生成 Go 结构体 ---------- */
  function goPascal(raw) {
    var parts = String(raw).split(/[^A-Za-z0-9]+/).filter(Boolean);
    var s = parts.map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join('');
    if (!s) s = 'Field';
    if (/^\d/.test(s)) s = 'N' + s;
    return s;
  }

  function generateGo(root) {
    var defs = [];
    var used = {};
    function uniqueName(base) {
      var name = base, i = 2;
      while (used[name]) { name = base + i; i++; }
      used[name] = true;
      return name;
    }
    function infer(v, name) {
      if (v === null) return 'interface{}';
      if (Array.isArray(v)) {
        if (v.length === 0) return '[]interface{}';
        var ts = [];
        v.forEach(function (el) {
          var t = infer(el, name + 'Item');
          if (ts.indexOf(t) === -1) ts.push(t);
        });
        return ts.length === 1 ? '[]' + ts[0] : '[]interface{}';
      }
      if (typeof v === 'object') {
        var st = uniqueName(name);
        var lines = Object.keys(v).map(function (k) {
          return '  ' + goPascal(k) + ' ' + infer(v[k], st + goPascal(k)) + ' `json:"' + k + '"`';
        });
        defs.push('type ' + st + ' struct {\n' + lines.join('\n') + '\n}');
        return st;
      }
      if (typeof v === 'string') return 'string';
      if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float64';
      if (typeof v === 'boolean') return 'bool';
      return 'interface{}';
    }
    function inferArrayOfObjects(arr, name) {
      var allKeys = [];
      arr.forEach(function (el) {
        if (el && typeof el === 'object' && !Array.isArray(el)) {
          Object.keys(el).forEach(function (k) { if (allKeys.indexOf(k) === -1) allKeys.push(k); });
        }
      });
      var st = uniqueName(name);
      var lines = allKeys.map(function (k) {
        var present = 0, t = 'interface{}';
        arr.forEach(function (el) {
          if (el && typeof el === 'object' && k in el) {
            present++;
            if (t === 'interface{}') t = infer(el[k], st + goPascal(k));
          }
        });
        if (present < arr.length) t = '*' + t;
        return '  ' + goPascal(k) + ' ' + t + ' `json:"' + k + '"`';
      });
      defs.push('type ' + st + ' struct {\n' + lines.join('\n') + '\n}');
      return st;
    }
    var top;
    if (Array.isArray(root) && root.length > 0 && root.every(function (el) { return el && typeof el === 'object' && !Array.isArray(el); })) {
      var item = inferArrayOfObjects(root, 'Item');
      return 'package main\n\n' + defs.join('\n\n') + '\n\ntype Root []' + item + '\n';
    }
    top = infer(root, 'Root');
    if (top === 'Root') return 'package main\n\n' + defs.join('\n\n');
    return 'package main\n\n' + defs.join('\n\n') + (defs.length ? '\n\n' : '') + 'type Root ' + top + '\n';
  }

  /* ---------- 生成 Python dataclass ---------- */
  function pyClassName(raw) {
    var parts = String(raw).split(/[^A-Za-z0-9]+/).filter(Boolean);
    var s = parts.map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join('');
    if (!s) s = 'Item';
    if (/^\d/.test(s)) s = '_' + s;
    return s;
  }

  function pyFieldName(raw) {
    var s = String(raw).replace(/[^A-Za-z0-9_]/g, '_');
    if (/^\d/.test(s)) s = '_' + s;
    if (!s) s = 'field';
    return s;
  }

  function generatePy(root) {
    var defs = [];
    var used = {};
    var needs = { List: false, Optional: false, Any: false };
    function uniqueName(base) {
      var name = base, i = 2;
      while (used[name]) { name = base + i; i++; }
      used[name] = true;
      return name;
    }
    function infer(v, name) {
      if (v === null) { needs.Any = true; return 'Any'; }
      if (Array.isArray(v)) {
        needs.List = true;
        if (v.length === 0) { needs.Any = true; return 'List[Any]'; }
        var ts = [];
        v.forEach(function (el) {
          var t = infer(el, name + 'Item');
          if (ts.indexOf(t) === -1) ts.push(t);
        });
        return ts.length === 1 ? 'List[' + ts[0] + ']' : 'List[Any]';
      }
      if (typeof v === 'object') {
        var cls = uniqueName(name);
        var keys = Object.keys(v);
        var lines = keys.map(function (k) {
          return '    ' + pyFieldName(k) + ': ' + infer(v[k], cls + pyClassName(k));
        });
        if (lines.length === 0) lines.push('    pass');
        defs.push('@dataclass\nclass ' + cls + ':\n' + lines.join('\n'));
        return cls;
      }
      if (typeof v === 'string') return 'str';
      if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
      if (typeof v === 'boolean') return 'bool';
      needs.Any = true; return 'Any';
    }
    function inferArrayOfObjects(arr, name) {
      var allKeys = [];
      arr.forEach(function (el) {
        if (el && typeof el === 'object' && !Array.isArray(el)) {
          Object.keys(el).forEach(function (k) { if (allKeys.indexOf(k) === -1) allKeys.push(k); });
        }
      });
      var cls = uniqueName(name);
      var lines = allKeys.map(function (k) {
        var present = 0, t = 'Any';
        arr.forEach(function (el) {
          if (el && typeof el === 'object' && k in el) {
            present++;
            if (t === 'Any') t = infer(el[k], cls + pyClassName(k));
          }
        });
        if (t === 'Any') needs.Any = true;
        if (present < arr.length) { needs.Optional = true; t = 'Optional[' + t + ']'; }
        return '    ' + pyFieldName(k) + ': ' + t;
      });
      if (lines.length === 0) lines.push('    pass');
      defs.push('@dataclass\nclass ' + cls + ':\n' + lines.join('\n'));
      return cls;
    }
    var header = 'from dataclasses import dataclass\n';
    var typing = [];
    var tail = '';
    if (Array.isArray(root) && root.length > 0 && root.every(function (el) { return el && typeof el === 'object' && !Array.isArray(el); })) {
      var item = inferArrayOfObjects(root, 'Item');
      if (needs.List) typing.push('List');
      if (needs.Optional) typing.push('Optional');
      if (needs.Any) typing.push('Any');
      if (typing.length) header += 'from typing import ' + typing.join(', ') + '\n';
      return header + '\n' + defs.join('\n\n') + '\n\nRoot = List[' + item + ']\n';
    }
    var top = infer(root, 'Root');
    if (needs.List) typing.push('List');
    if (needs.Optional) typing.push('Optional');
    if (needs.Any) typing.push('Any');
    if (typing.length) header += 'from typing import ' + typing.join(', ') + '\n';
    if (top === 'Root') return header + '\n' + defs.join('\n\n') + '\n';
    return header + '\n' + defs.join('\n\n') + (defs.length ? '\n\n' : '') + 'Root = ' + top + '\n';
  }

  /* ---------- 转 YAML ---------- */
  function yamlScalar(v) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    var s = String(v);
    if (s === '' || /^\s|\s$/.test(s) || /^(true|false|null|~|yes|no|on|off)$/i.test(s) ||
        /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s) || /[:#{}[\],&*?|>'"%@`!]/.test(s) || s.indexOf('\n') !== -1) {
      return JSON.stringify(s);
    }
    return s;
  }

  function yamlKey(k) {
    return (/[:#{}[\],&*?|>'"%@`!]/.test(k) || /^\s|\s$/.test(k) || k === '') ? JSON.stringify(k) : k;
  }

  function toYamlLines(v, indent) {
    var pad = '  '.repeat(indent);
    if (Array.isArray(v)) {
      if (v.length === 0) return [pad + '[]'];
      var lines = [];
      v.forEach(function (el) {
        if (el && typeof el === 'object') {
          var sub = toYamlLines(el, indent + 1);
          lines.push(pad + '- ' + sub[0].slice((indent + 1) * 2));
          for (var i = 1; i < sub.length; i++) lines.push(sub[i]);
        } else {
          lines.push(pad + '- ' + yamlScalar(el));
        }
      });
      return lines;
    }
    if (v && typeof v === 'object') {
      var keys = Object.keys(v);
      if (keys.length === 0) return [pad + '{}'];
      var out = [];
      keys.forEach(function (k) {
        var val = v[k];
        var key = yamlKey(k);
        if (val && typeof val === 'object') {
          if (Array.isArray(val) && val.length === 0) out.push(pad + key + ': []');
          else if (!Array.isArray(val) && Object.keys(val).length === 0) out.push(pad + key + ': {}');
          else {
            out.push(pad + key + ':');
            out = out.concat(toYamlLines(val, indent + 1));
          }
        } else {
          out.push(pad + key + ': ' + yamlScalar(val));
        }
      });
      return out;
    }
    return [pad + yamlScalar(v)];
  }

  function doYaml() {
    var r = parseInput();
    if (!r) return;
    var yaml = toYamlLines(r.value, 0).join('\n');
    showOutput(yaml, { mode: 'yaml', download: 'data.yaml', stats: 'YAML' });
    detailStats.textContent = '已转为 YAML';
    setStatus('ok', '已转为 YAML，可复制或下载');
  }

  /* ---------- JSON 对比 ---------- */
  function diffLines(aLines, bLines) {
    var n = aLines.length, m = bLines.length;
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var ops = [], i = 0, j = 0;
    while (i < n && j < m) {
      if (aLines[i] === bLines[j]) { ops.push({ t: 'same', line: aLines[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', line: aLines[i] }); i++; }
      else { ops.push({ t: 'add', line: bLines[j] }); j++; }
    }
    while (i < n) { ops.push({ t: 'del', line: aLines[i] }); i++; }
    while (j < m) { ops.push({ t: 'add', line: bLines[j] }); j++; }
    return ops;
  }

  function doDiff() {
    var r = parseInput();
    if (!r) return;
    var otherText = $('diffInput').value;
    if (!otherText.trim()) { showToast('请在对比框里粘贴第二份 JSON'); return; }
    var other;
    try { other = JSON.parse(otherText); } catch (e) {
      setStatus('err', '第二份 JSON 无效：' + e.message);
      return;
    }
    var a = JSON.stringify($('sortKeys').checked ? sortDeep(r.value) : r.value, null, getIndent()).split('\n');
    var b = JSON.stringify($('sortKeys').checked ? sortDeep(other) : other, null, getIndent()).split('\n');
    if (a.length > 2000 || b.length > 2000) { showToast('文件太大，单份请控制在 2000 行以内'); return; }
    var ops = diffLines(a, b);
    var add = 0, del = 0;
    ops.forEach(function (o) { if (o.t === 'add') add++; else if (o.t === 'del') del++; });
    var view = $('diffView');
    view.innerHTML = '';
    ops.forEach(function (o) {
      var row = document.createElement('div');
      row.className = 'diff-row diff-' + o.t;
      row.textContent = (o.t === 'add' ? '+ ' : o.t === 'del' ? '− ' : '  ') + o.line;
      view.appendChild(row);
    });
    view.hidden = false;
    output.hidden = true;
    tree.hidden = true;
    $('diffStats').textContent = '新增 ' + add + ' 行 · 删除 ' + del + ' 行 · 相同 ' + (ops.length - add - del) + ' 行';
    setStatus('ok', '对比完成：新增 ' + add + ' 行，删除 ' + del + ' 行');
  }

  /* ---------- 转义 / 去转义 ---------- */
  function doEscape() {
    var text = input.value;
    if (!text.trim()) { showToast('输入为空，先粘贴内容'); return; }
    showOutput(JSON.stringify(text), { mode: 'text', download: 'escaped.txt', stats: '已转义' });
    setStatus('ok', '已转义为 JSON 字符串');
  }

  function doUnescape() {
    var text = input.value;
    if (!text.trim()) { showToast('输入为空，先粘贴内容'); return; }
    try {
      var v = JSON.parse(text);
      if (typeof v !== 'string') { showToast('输入不是一个 JSON 字符串'); return; }
      showOutput(v, { mode: 'text', download: 'unescaped.txt', stats: '已还原' });
      setStatus('ok', '已还原转义字符串');
    } catch (e) {
      setStatus('err', '去转义失败：' + e.message);
    }
  }

  /* ---------- 分享链接 ---------- */
  function toBase64Url(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function doShare() {
    var data = lastFormatted || input.value;
    if (!data.trim()) { showToast('没有可分享的内容，先格式化一次'); return; }
    var url = location.origin + location.pathname + '#j=' + toBase64Url(data);
    copyText(url);
    showToast('分享链接已复制，打开即是这份数据');
  }

  function loadFromHash() {
    var h = location.hash;
    if (h.indexOf('#j=') === 0) {
      try {
        var text = fromBase64Url(h.slice(3));
        input.value = text;
        updateGutter();
        doFormat();
        setStatus('ok', '已从分享链接载入数据');
      } catch (e) {
        setStatus('warn', '分享链接解析失败');
      }
    }
  }

  /* ---------- 历史记录 ---------- */
  function loadHistory() {
    try {
      var raw = localStorage.getItem('json-wb-history');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function renderHistory() {
    var sel = $('historySelect');
    var items = loadHistory();
    sel.innerHTML = '<option value="">最近的输入…</option>';
    items.forEach(function (item, idx) {
      var opt = document.createElement('option');
      opt.value = String(idx);
      var label = item.replace(/\s+/g, ' ').slice(0, 40);
      opt.textContent = label + (item.length > 40 ? '…' : '');
      sel.appendChild(opt);
    });
  }

  function saveHistory(text) {
    if (!text || !text.trim() || text.length > 200000) return;
    try {
      var items = loadHistory().filter(function (t) { return t !== text; });
      items.unshift(text);
      localStorage.setItem('json-wb-history', JSON.stringify(items.slice(0, 5)));
      renderHistory();
    } catch (e) {}
  }

  $('historySelect').addEventListener('change', function () {
    var idx = this.value;
    if (idx === '') return;
    var items = loadHistory();
    var text = items[Number(idx)];
    if (text !== undefined) {
      input.value = text;
      updateGutter();
      doFormat();
    }
    this.value = '';
  });

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

  /* ---------- 带颜色的富文本复制 ---------- */
  // 颜色只活在页面的高亮 HTML 里，writeText 只写纯文本所以丢颜色。
  // 这里用 ClipboardItem 同时写 text/html（行内颜色，跟随当前主题）
  // 和 text/plain 两份：粘到 Word / Notion / 邮件里带颜色，粘到代码
  // 编辑器里自动回落成纯文本。
  function themeVar(name) {
    var v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) {}
    return v;
  }

  function buildRichHtml() {
    if (!lastFormatted) return null;
    // 直接对 lastFormatted 重新高亮，不读页面 DOM，避免输出区内容
    // 与 lastFormatted 不一致时（比如只点了验证没点格式化）文不对题
    var highlighted = highlight(lastFormatted);
    if (highlighted.indexOf('<span class="k">') === -1 &&
        highlighted.indexOf('<span class="s">') === -1) return null;
    var colors = {
      k: themeVar('--key') || '#82aaff',
      s: themeVar('--string') || '#ecc48d',
      n: themeVar('--number') || '#f78c6c',
      b: themeVar('--bool') || '#c792ea',
      u: themeVar('--null') || '#ff5370',
      p: themeVar('--punct') || themeVar('--muted') || '#89ddff'
    };
    var rich = highlighted
      .replace(/<span class="k">/g, '<span style="color:' + colors.k + '">')
      .replace(/<span class="s">/g, '<span style="color:' + colors.s + '">')
      .replace(/<span class="n">/g, '<span style="color:' + colors.n + '">')
      .replace(/<span class="b">/g, '<span style="color:' + colors.b + '">')
      .replace(/<span class="u">/g, '<span style="color:' + colors.u + '">')
      .replace(/<span class="p">/g, '<span style="color:' + colors.p + '">');
    var bg = themeVar('--panel') || themeVar('--bg') || '#171a21';
    var fg = themeVar('--text') || '#e6e8ec';
    return '<pre style="background:' + bg + ';color:' + fg +
      ';font-family:Menlo,Consolas,\'Courier New\',monospace;font-size:13px;' +
      'line-height:1.6;margin:0;padding:12px;white-space:pre;"><code>' +
      rich + '</code></pre>';
  }

  function copyFormatted() {
    if (!lastFormatted) { showToast('没有可复制的内容，先格式化一次'); return; }
    // 非 JSON 输出（YAML、对比结果等）没有高亮，直接走纯文本
    if (outputMode !== 'json') { copyText(lastFormatted); return; }
    var richHtml = buildRichHtml();
    if (!richHtml || !window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) {
      copyText(lastFormatted);
      return;
    }
    var item = new ClipboardItem({
      'text/html': new Blob([richHtml], { type: 'text/html' }),
      'text/plain': new Blob([lastFormatted], { type: 'text/plain' })
    });
    navigator.clipboard.write([item]).then(
      function () { showToast('已复制（带颜色）'); },
      function () { copyText(lastFormatted); }
    );
  }

  function downloadJson() {
    if (!lastFormatted) { showToast('没有可下载的内容，先格式化一次'); return; }
    var blob = new Blob([lastFormatted], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = lastDownloadName;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    showToast('已下载 ' + lastDownloadName);
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

  /* ---------- 快捷键 ---------- */
  // 注册表：改键只改 combo，行为由 run 决定；allowEditable 表示焦点在
  // 输入框里时是否仍然生效（比如 Ctrl+Enter 在输入框里也要能格式化）
  var SHORTCUTS = [
    { id: 'format', name: '格式化', combo: 'ctrl+enter', allowEditable: true, run: doFormat },
    { id: 'selectResult', name: '选中格式化结果', combo: 'ctrl+a', allowEditable: false, run: selectResult },
    { id: 'copyResult', name: '复制结果（带颜色）', combo: 'ctrl+alt+c', allowEditable: true, run: copyFormatted },
    { id: 'toggleTree', name: '展开 / 折叠全部节点（树形）', combo: 'ctrl+l', allowEditable: true, run: toggleAllTree },
    { id: 'openSettings', name: '打开快捷键设置', combo: 'ctrl+alt+s', allowEditable: true, run: openShortcutSettings }
  ];
  var listeningId = null;

  function comboLabel(combo) {
    return combo.split('+').map(function (p) {
      if (p === 'ctrl') return 'Ctrl';
      if (p === 'alt') return 'Alt';
      if (p === 'shift') return 'Shift';
      if (p === 'enter') return 'Enter';
      if (p === 'space') return 'Space';
      return p.toUpperCase();
    }).join('+');
  }

  function loadShortcuts() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('json-wb-shortcuts') || '{}'); } catch (e) {}
    SHORTCUTS.forEach(function (s) {
      if (saved[s.id]) s.combo = saved[s.id];
    });
  }

  function saveShortcuts() {
    var saved = {};
    SHORTCUTS.forEach(function (s) { saved[s.id] = s.combo; });
    try { localStorage.setItem('json-wb-shortcuts', JSON.stringify(saved)); } catch (e) {}
  }

  function findShortcutByCombo(combo) {
    for (var i = 0; i < SHORTCUTS.length; i++) {
      if (SHORTCUTS[i].combo === combo) return SHORTCUTS[i];
    }
    return null;
  }

  // 把按键事件归一化成注册表里的组合键写法（Mac 的 Cmd 按 Ctrl 算）
  function eventCombo(e) {
    var k = (e.key || '').toLowerCase();
    if (k === 'control' || k === 'alt' || k === 'shift' || k === 'meta') return null;
    var parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(k === ' ' ? 'space' : k);
    return parts.join('+');
  }

  function renderFooterHint() {
    var el = $('footerHint');
    if (!el) return;
    function label(id) {
      for (var i = 0; i < SHORTCUTS.length; i++) {
        if (SHORTCUTS[i].id === id) return comboLabel(SHORTCUTS[i].combo);
      }
      return '';
    }
    el.textContent = label('format') + ' 格式化 · ' + label('selectResult') + ' 选中结果 · ' +
      label('copyResult') + ' 复制结果 · ' + label('openSettings') + ' 快捷键设置';
  }

  /* ---------- 快捷键设置弹窗 ---------- */
  function openShortcutSettings() {
    var overlay = $('shortcutOverlay');
    if (!overlay.hidden) { closeShortcutSettings(); return; }
    renderShortcutList();
    overlay.hidden = false;
  }

  function closeShortcutSettings() {
    cancelRebind();
    $('shortcutOverlay').hidden = true;
  }

  function renderShortcutList() {
    var list = $('shortcutList');
    list.innerHTML = '';
    SHORTCUTS.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'sc-row' + (listeningId === s.id ? ' listening' : '');
      var name = document.createElement('span');
      name.className = 'sc-name';
      name.textContent = s.name;
      var keys = document.createElement('kbd');
      keys.className = 'sc-keys';
      keys.textContent = listeningId === s.id ? '按下新的组合键…' : comboLabel(s.combo);
      var btn = document.createElement('button');
      btn.className = 'btn small';
      btn.textContent = listeningId === s.id ? '取消' : '更改';
      btn.addEventListener('click', function () {
        if (listeningId === s.id) cancelRebind();
        else startRebind(s.id);
      });
      row.appendChild(name);
      row.appendChild(keys);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function startRebind(id) {
    listeningId = id;
    renderShortcutList();
  }

  function cancelRebind() {
    if (!listeningId) return;
    listeningId = null;
    if (!$('shortcutOverlay').hidden) renderShortcutList();
  }

  function captureCombo(e) {
    var combo = eventCombo(e);
    if (!combo) return;
    if (combo === 'escape') { cancelRebind(); return; }
    var parts = combo.split('+');
    // 至少包含 Ctrl / Cmd 或 Alt，否则单键会抢走正常打字
    if (parts.indexOf('ctrl') === -1 && parts.indexOf('alt') === -1) {
      showToast('组合键至少包含 Ctrl / Cmd 或 Alt');
      return;
    }
    var other = findShortcutByCombo(combo);
    if (other && other.id !== listeningId) {
      showToast('已被「' + other.name + '」占用，换一组试试');
      return;
    }
    for (var i = 0; i < SHORTCUTS.length; i++) {
      if (SHORTCUTS[i].id === listeningId) SHORTCUTS[i].combo = combo;
    }
    saveShortcuts();
    renderFooterHint();
    listeningId = null;
    renderShortcutList();
    showToast('已保存');
  }

  /* ---------- 事件绑定 ---------- */
  $('btnFormat').addEventListener('click', doFormat);
  $('btnMinify').addEventListener('click', doMinify);
  $('btnValidate').addEventListener('click', doValidate);
  $('btnRepair').addEventListener('click', doRepair);
  $('btnJsonPath').addEventListener('click', doJsonPath);
  $('jsonpathInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doJsonPath();
  });
  $('btnJpClose').addEventListener('click', function () {
    $('jpResults').hidden = true;
    $('jsonpathCount').textContent = '';
  });
  /* ---------- 更多工具下拉菜单 ---------- */
  function closeMore() {
    $('moreMenu').hidden = true;
    $('btnMore').setAttribute('aria-expanded', 'false');
  }

  $('btnMore').addEventListener('click', function (e) {
    e.stopPropagation();
    var menu = $('moreMenu');
    menu.hidden = !menu.hidden;
    $('btnMore').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', function (e) {
    if (!$('moreMenu').hidden && !e.target.closest('.more-wrap')) closeMore();
  });
  // 中央快捷键入口：所有快捷键都走注册表匹配
  document.addEventListener('keydown', function (e) {
    // 改键监听中：捕获下一组组合键，不执行任何动作
    if (listeningId) {
      e.preventDefault();
      e.stopPropagation();
      captureCombo(e);
      return;
    }
    if (e.key === 'Escape') {
      if (!$('shortcutOverlay').hidden) { closeShortcutSettings(); return; }
      closeMore();
      return;
    }
    var combo = eventCombo(e);
    if (!combo) return;
    var sc = findShortcutByCombo(combo);
    if (!sc) return;
    var ae = document.activeElement;
    var tag = ae ? ae.tagName : '';
    var editable = !!ae && (ae.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
    if (editable && !sc.allowEditable) return;
    e.preventDefault();
    sc.run();
  });

  /* ---------- 快捷键设置弹窗绑定 ---------- */
  $('btnShortcuts').addEventListener('click', function () {
    closeMore();
    openShortcutSettings();
  });
  $('btnShortcutClose').addEventListener('click', closeShortcutSettings);
  $('btnShortcutReset').addEventListener('click', function () {
    var defaults = { format: 'ctrl+enter', selectResult: 'ctrl+a', copyResult: 'ctrl+alt+c', toggleTree: 'ctrl+l', openSettings: 'ctrl+alt+s' };
    SHORTCUTS.forEach(function (s) { s.combo = defaults[s.id]; });
    saveShortcuts();
    renderFooterHint();
    renderShortcutList();
    showToast('已恢复默认快捷键');
  });
  $('shortcutOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeShortcutSettings();
  });

  /* ---------- JSONPath 栏开关 ---------- */
  $('btnJpToggle').addEventListener('click', function () {
    var bar = $('jpBar');
    bar.hidden = !bar.hidden;
    if (!bar.hidden) $('jsonpathInput').focus();
  });

  $('btnGenType').addEventListener('click', function () { doGenerateType(); closeMore(); });
  $('btnYaml').addEventListener('click', function () { doYaml(); closeMore(); });
  $('btnDiff').addEventListener('click', function () {
    $('diffPanel').hidden = false;
    $('diffInput').focus();
    closeMore();
  });
  $('btnDiffClose').addEventListener('click', function () { $('diffPanel').hidden = true; });
  $('btnDoDiff').addEventListener('click', doDiff);
  $('btnEscape').addEventListener('click', function () { doEscape(); closeMore(); });
  $('btnUnescape').addEventListener('click', function () { doUnescape(); closeMore(); });
  $('btnShare').addEventListener('click', function () { doShare(); closeMore(); });
  $('viewCode').addEventListener('click', function () { setView('code'); });
  $('viewTree').addEventListener('click', function () {
    if (lastValue === null) { showToast('先格式化或验证一次，再看树形视图'); return; }
    setView('tree');
  });

  $('btnCopy').addEventListener('click', function () {
    copyFormatted();
  });
  $('btnDownload').addEventListener('click', downloadJson);

  $('btnClear').addEventListener('click', function () {
    input.value = '';
    lastValue = null;
    lastFormatted = '';
    outputMode = 'json';
    lastDownloadName = 'formatted.json';
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

  /* ---------- 初始化 ---------- */
  (function init() {
    var theme = 'dark';
    try { theme = localStorage.getItem('json-wb-theme') || 'dark'; } catch (e) {}
    applyTheme(theme);
    loadShortcuts();
    renderFooterHint();
    initResizer();
    renderHistory();
    updateGutter();
    loadFromHash();
  })();
})();
