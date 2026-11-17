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

  /* 返回缩进字符串：'  ' / '    ' / '\t' */
  function indentString() {
    var v = $('indentSelect').value;
    if (v === 'tab') return '\t';
    return repeatStr(' ', Number(v));
  }

  function repeatStr(s, n) {
    var r = '';
    for (var i = 0; i < n; i++) r += s;
    return r;
  }

  /* ---------- 多语言 ---------- */
  // 支持的语言：JSON（原有全部功能）+ SQL / Python / Go / Java（轻量格式化：
  // 缩进、换行、关键字规范，不做完整语法解析——不是 gofmt / black 那种
  // 全量解析器，特别乱的代码仍需人工检查）。
  var LANGS = { json: 'JSON', sql: 'SQL', python: 'Python', go: 'Go', java: 'Java' };
  var currentLang = 'json';  // 当前实际语言
  var langMode = 'auto';     // 'auto' 自动检测 | 某个具体语言（用户手动锁定）

  function loadLangMode() {
    try { langMode = localStorage.getItem('json-wb-lang-mode') || 'auto'; } catch (e) {}
    if (LANGS[langMode]) currentLang = langMode;
    else langMode = 'auto';
  }

  function saveLangMode() {
    try { localStorage.setItem('json-wb-lang-mode', langMode); } catch (e) {}
  }

  /* 按内容猜语言：只在「自动检测」模式下调用 */
  function detectLanguage(text) {
    if (!text || text.length > 200000) return null;
    var t = text.replace(/^\s+/, '');
    if (!t) return null;
    if (t[0] === '{' || t[0] === '[') {
      try { JSON.parse(text); return 'json'; } catch (e) {}
    }
    if (/^(SELECT|WITH|INSERT\s+INTO|UPDATE\s|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW)|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(t)) return 'sql';
    if (/^package\s+[\w\/]+\s*$/m.test(text)) return 'go';
    if (/\bfunc(\s+\w+)?\s*\(/.test(text)) return 'go';
    if (/^\s*import\s+"[^"]+"/m.test(text)) return 'go';
    if (/^\s*(public\s+(final\s+)?(class|interface|enum)|import\s+java\.|package\s+[\w.]+;)/m.test(text)) return 'java';
    if (/^\s*(public\s+)?(final\s+)?class\s+\w+\s*\{/m.test(text)) return 'java';
    if (/\bSystem\.out\.println\b/.test(text)) return 'java';
    if (/^\s*(def\s+\w+\s*\(|class\s+\w+\s*(\(|:)|from\s+[\w.]+\s+import\s|if\s+__name__\s*==|import\s+[a-z_][\w]*\s*$|print\s*\()/m.test(text)) return 'python';
    if (/\bSELECT\b[\s\S]{0,200}?\bFROM\b/i.test(text)) return 'sql';
    return null;
  }

  function outputPlaceholder() {
    return currentLang === 'json' ? '格式化后的 JSON 会显示在这里。' : '格式化后的' + LANGS[currentLang] + '代码会显示在这里。';
  }

  var LANG_PLACEHOLDERS = {
    json: '在此粘贴 JSON，例如：{"name": "Muse", "version": 1}',
    sql: '在此粘贴 SQL，例如：SELECT id, name FROM users WHERE age > 18 ORDER BY id',
    python: '在此粘贴 Python 代码，例如：def hello():\n    print("hi")',
    go: '在此粘贴 Go 代码，例如：package main\n\nfunc main() {\n\tfmt.Println("hi")\n}',
    java: '在此粘贴 Java 代码，例如：public class Hello {\n    public static void main(String[] args) {}\n}'
  };

  /* 根据当前语言显示 / 隐藏各功能：树形、JSONPath、排序、转 YAML、生成类型、
     对比、转义、修复都是 JSON 专属；压缩只支持 JSON 和 SQL */
  function updateLangUI() {
    var isJson = currentLang === 'json';
    $('sortKeysWrap').hidden = !isJson;
    $('btnRepair').hidden = !isJson;
    $('btnJpToggle').hidden = !isJson;
    $('viewSeg').hidden = !isJson;
    $('typeRow').hidden = !isJson;
    $('btnYaml').hidden = !isJson;
    $('btnDiff').hidden = !isJson;
    $('btnEscape').hidden = !isJson;
    $('btnUnescape').hidden = !isJson;
    var canMinify = currentLang === 'json' || currentLang === 'sql';
    $('btnMinify').disabled = !canMinify;
    $('btnMinify').title = canMinify ? '压缩成一行' : LANGS[currentLang] + ' 不支持压缩（换行有语法意义）';
    if (!isJson) {
      if (currentView === 'tree') setView('code');
      $('jpBar').hidden = true;
      $('jpResults').hidden = true;
      $('diffPanel').hidden = true;
    }
    input.placeholder = LANG_PLACEHOLDERS[currentLang];
    if (!lastFormatted) output.innerHTML = '<code>' + outputPlaceholder() + '</code>';
  }

  function setLang(mode) {
    langMode = mode;
    saveLangMode();
    if (LANGS[mode]) {
      currentLang = mode;
    } else {
      langMode = 'auto';
      var d = detectLanguage(input.value);
      if (d) currentLang = d;
    }
    $('langSelect').value = langMode;
    updateLangUI();
  }

  $('langSelect').addEventListener('change', function () {
    setLang(this.value);
    if (input.value.trim()) {
      setStatus('idle', '已切换到' + (langMode === 'auto' ? '自动检测（当前：' + LANGS[currentLang] + '）' : LANGS[currentLang]) + '，点击「格式化」');
    }
  });

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
    if (page && page !== 'index.html') location.href = page;
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
    if (m) {
      var pos = Number(m[1]);
      var before = text.slice(0, pos);
      var lines = before.split('\n');
      return { line: lines.length, col: lines[lines.length - 1].length + 1, pos: pos };
    }
    m = /line (\d+) column (\d+)/.exec(err.message);
    if (m) return { line: Number(m[1]), col: Number(m[2]), pos: -1 };
    // V8 有一类报错不带位置（"Unexpected token '}', ... is not valid JSON"）：
    // 对 } / ] 这类闭括号，取它在文本里的第一次出现——通常就是出错点
    var t = /Unexpected token '(.)'/.exec(err.message);
    if (t && (t[1] === '}' || t[1] === ']')) {
      var idx = text.indexOf(t[1]);
      if (idx !== -1) {
        var b = text.slice(0, idx).split('\n');
        return { line: b.length, col: b[b.length - 1].length + 1, pos: idx };
      }
    }
    return null;
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

  /* ---------- SQL 语法高亮 ---------- */
  // token 种类复用 JSON 的 class：关键字 k、字符串 s、数字 n、函数 b、
  // 标点 p；注释另用 c（--muted）。不命中关键字的标识符不包 span。
  function highlightSql(sql) {
    var re = /(--[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(`(?:[^`]|``)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_$]*)|(\S)/g;
    var out = '', last = 0, m;
    while ((m = re.exec(sql))) {
      out += escapeHtml(sql.slice(last, m.index));
      if (m[1] !== undefined || m[2] !== undefined) {
        out += '<span class="c">' + escapeHtml(m[0]) + '</span>';
      } else if (m[3] !== undefined || m[4] !== undefined || m[5] !== undefined) {
        out += '<span class="s">' + escapeHtml(m[0]) + '</span>';
      } else if (m[6] !== undefined) {
        out += '<span class="n">' + m[0] + '</span>';
      } else if (m[7] !== undefined) {
        var w = m[7];
        if (SQL_KEYWORDS[w.toUpperCase()]) {
          out += '<span class="k">' + w + '</span>';
        } else if (/^\s*\(/.test(sql.slice(re.lastIndex))) {
          out += '<span class="b">' + w + '</span>'; // 函数名：标识符后紧跟 (
        } else {
          out += escapeHtml(w);
        }
      } else {
        out += '<span class="p">' + escapeHtml(m[0]) + '</span>';
      }
      last = re.lastIndex;
    }
    out += escapeHtml(sql.slice(last));
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

  /* ---------- 树形搜索 ---------- */
  // 按键名或叶子值过滤：命中的节点与其祖先保留显示，其余隐藏；
  // 命中节点的子树自动展开，清空搜索后整棵树恢复默认展开状态
  function filterTree(q) {
    q = (q || '').trim().toLowerCase();
    var countEl = $('treeSearchCount');
    if (!q) {
      renderTreeView();
      countEl.textContent = '';
      return 0;
    }
    var matches = 0;
    function evalNode(node) {
      var childrenEl = null, leafEl = null, head = null;
      for (var i = 0; i < node.children.length; i++) {
        var c = node.children[i];
        if (c.className === 'tree-children') childrenEl = c;
        else if (c.className === 'tree-leaf') leafEl = c;
        else if (c.tagName === 'DIV' && !head) head = c;
      }
      var ownText = '';
      if (leafEl) ownText = leafEl.textContent;
      else if (head) {
        var keyEl = head.querySelector('.tree-key');
        ownText = keyEl ? keyEl.textContent : '';
      }
      var selfHit = ownText.toLowerCase().indexOf(q) !== -1;
      var childHit = false;
      if (childrenEl) {
        for (var j = 0; j < childrenEl.children.length; j++) {
          var child = childrenEl.children[j];
          if (child.className === 'tree-node' && evalNode(child)) childHit = true;
        }
      }
      var hit = selfHit || childHit;
      node.style.display = hit ? '' : 'none';
      if (hit && childrenEl) {
        childrenEl.style.display = '';
        var tail = null, toggle = null;
        for (var k = 0; k < node.children.length; k++) {
          if (node.children[k].className === 'tree-tail') tail = node.children[k];
        }
        if (tail) tail.style.display = '';
        if (head) toggle = head.querySelector('.tree-toggle');
        if (toggle) toggle.textContent = '▾';
      }
      if (selfHit) matches++;
      return hit;
    }
    var root = tree.firstElementChild;
    if (root && root.className === 'tree-node') evalNode(root);
    countEl.textContent = matches > 0 ? '找到 ' + matches + ' 个匹配' : '没有找到匹配';
    return matches;
  }

  function clearTreeSearch() {
    $('treeSearch').value = '';
    filterTree('');
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
    if (view === 'tree') {
      renderTreeView();
      $('treeSearchWrap').hidden = false;
      var q = $('treeSearch').value;
      if (q.trim()) filterTree(q);
    } else {
      $('treeSearchWrap').hidden = true;
    }
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
    } else if (outputMode === 'text' && currentLang === 'sql') {
      output.innerHTML = '<code>' + highlightSql(text) + '</code>';
    } else {
      output.innerHTML = '<code>' + escapeHtml(text) + '</code>';
    }
    outputStats.textContent = opts.stats || (text.length + ' 字符');
    if (currentView === 'tree' && outputMode === 'json') renderTreeView();
  }

  /* ---------- SQL 格式化 ---------- */
  var SQL_CLAUSES = { 'SELECT': 1, 'FROM': 1, 'WHERE': 1, 'GROUP BY': 1, 'ORDER BY': 1, 'HAVING': 1, 'LIMIT': 1, 'OFFSET': 1, 'UNION': 1, 'UNION ALL': 1, 'INTERSECT': 1, 'EXCEPT': 1, 'INSERT INTO': 1, 'VALUES': 1, 'UPDATE': 1, 'SET': 1, 'DELETE FROM': 1, 'CREATE TABLE': 1, 'ALTER TABLE': 1, 'DROP TABLE': 1 };
  var SQL_JOINS = { 'JOIN': 1, 'LEFT JOIN': 1, 'RIGHT JOIN': 1, 'INNER JOIN': 1, 'FULL JOIN': 1, 'CROSS JOIN': 1, 'LEFT OUTER JOIN': 1, 'RIGHT OUTER JOIN': 1, 'FULL OUTER JOIN': 1 };
  var SQL_KEYWORDS = { 'SELECT': 1, 'FROM': 1, 'WHERE': 1, 'GROUP': 1, 'BY': 1, 'ORDER': 1, 'HAVING': 1, 'LIMIT': 1, 'OFFSET': 1, 'UNION': 1, 'INTERSECT': 1, 'EXCEPT': 1, 'ALL': 1, 'DISTINCT': 1, 'AS': 1, 'AND': 1, 'OR': 1, 'NOT': 1, 'IN': 1, 'IS': 1, 'NULL': 1, 'LIKE': 1, 'BETWEEN': 1, 'EXISTS': 1, 'CASE': 1, 'WHEN': 1, 'THEN': 1, 'ELSE': 1, 'END': 1, 'JOIN': 1, 'LEFT': 1, 'RIGHT': 1, 'INNER': 1, 'FULL': 1, 'CROSS': 1, 'OUTER': 1, 'ON': 1, 'INTO': 1, 'VALUES': 1, 'SET': 1, 'UPDATE': 1, 'DELETE': 1, 'INSERT': 1, 'CREATE': 1, 'TABLE': 1, 'ALTER': 1, 'DROP': 1, 'ADD': 1, 'PRIMARY': 1, 'KEY': 1, 'FOREIGN': 1, 'REFERENCES': 1, 'INDEX': 1, 'VIEW': 1, 'ASC': 1, 'DESC': 1, 'COUNT': 1, 'SUM': 1, 'AVG': 1, 'MIN': 1, 'MAX': 1, 'CAST': 1, 'WITH': 1, 'OVER': 1, 'PARTITION': 1, 'TRUE': 1, 'FALSE': 1 };

  function tokenizeSql(text) {
    var tokens = [], i = 0, n = text.length;
    while (i < n) {
      var c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '-' && text[i + 1] === '-') {
        var j = text.indexOf('\n', i);
        if (j === -1) j = n;
        tokens.push({ t: 'comment', v: text.slice(i, j) });
        i = j; continue;
      }
      if (c === '/' && text[i + 1] === '*') {
        var k = text.indexOf('*/', i + 2);
        if (k === -1) k = n - 2;
        tokens.push({ t: 'comment', v: text.slice(i, k + 2) });
        i = k + 2; continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        var q = c, p = i + 1;
        while (p < n) {
          if (text[p] === q) {
            if (text[p + 1] === q) { p += 2; continue; }
            p++; break;
          }
          p++;
        }
        tokens.push({ t: 'string', v: text.slice(i, p) });
        i = p; continue;
      }
      if (c === '[') {
        var b = text.indexOf(']', i);
        if (b === -1) b = n - 1;
        tokens.push({ t: 'string', v: text.slice(i, b + 1) });
        i = b + 1; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var w = i;
        while (w < n && /[A-Za-z0-9_$]/.test(text[w])) w++;
        tokens.push({ t: 'word', v: text.slice(i, w) });
        i = w; continue;
      }
      if (/[0-9]/.test(c)) {
        var d = i;
        while (d < n && /[0-9A-Za-z_.]/.test(text[d])) d++;
        tokens.push({ t: 'num', v: text.slice(i, d) });
        i = d; continue;
      }
      var two = text.substr(i, 2);
      if (two === '>=' || two === '<=' || two === '<>' || two === '!=' || two === '||') {
        tokens.push({ t: 'op', v: two });
        i += 2; continue;
      }
      tokens.push({ t: 'punct', v: c });
      i++;
    }
    return tokens;
  }

  /* 把 GROUP BY、LEFT OUTER JOIN 这类多词关键字合并成一个 token */
  function combineSqlKeywords(tokens) {
    var PAIRS = { 'GROUP BY': 1, 'ORDER BY': 1, 'LEFT JOIN': 1, 'RIGHT JOIN': 1, 'INNER JOIN': 1, 'FULL JOIN': 1, 'CROSS JOIN': 1, 'UNION ALL': 1, 'INSERT INTO': 1, 'DELETE FROM': 1, 'CREATE TABLE': 1, 'ALTER TABLE': 1, 'DROP TABLE': 1 };
    var TRIPLES = { 'LEFT OUTER JOIN': 1, 'RIGHT OUTER JOIN': 1, 'FULL OUTER JOIN': 1 };
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.t === 'word' && i + 2 < tokens.length && tokens[i + 1].t === 'word' && tokens[i + 2].t === 'word') {
        var tri = (t.v + ' ' + tokens[i + 1].v + ' ' + tokens[i + 2].v).toUpperCase();
        if (TRIPLES[tri]) { out.push({ t: 'word', v: tri }); i += 2; continue; }
      }
      if (t.t === 'word' && i + 1 < tokens.length && tokens[i + 1].t === 'word') {
        var pair = (t.v + ' ' + tokens[i + 1].v).toUpperCase();
        if (PAIRS[pair]) { out.push({ t: 'word', v: pair }); i++; continue; }
      }
      out.push(t);
    }
    return out;
  }

  function formatSql(text, indentStr) {
    var tokens = combineSqlKeywords(tokenizeSql(text));
    var lines = [];
    var cur = '';
    var level = 0;
    var parenStack = []; // 'func' 函数调用括号 | 'block' 子查询 / 列表括号
    var betweenPending = false;
    function ind(lv) { return repeatStr(indentStr, lv); }
    function contIndent() { return level + (parenStack.length === 0 ? 1 : 0); }
    function trimEnd(s) { return s.replace(/\s+$/, ''); }
    function newline(lv) {
      if (trimEnd(cur) !== '') lines.push(trimEnd(cur));
      cur = ind(lv);
    }
    function append(tok, prev) {
      var sp = false;
      if (trimEnd(cur) !== '') {
        if (tok.v === ',' || tok.v === ';' || tok.v === ')' || tok.v === '.') sp = false;
        else if (prev && (prev.v === '(' || prev.v === '.')) sp = false;
        else sp = true;
      }
      cur += (sp ? ' ' : '') + tok.v;
    }
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var prev = i > 0 ? tokens[i - 1] : null;
      var up = tok.t === 'word' ? tok.v.toUpperCase() : null;
      if (up && SQL_KEYWORDS[up]) tok.v = up;
      if (tok.t === 'comment') {
        if (tok.v.indexOf('--') === 0) {
          if (trimEnd(cur) !== '') cur += ' ';
          cur += tok.v;
          newline(level);
        } else {
          append(tok, prev);
        }
        continue;
      }
      if (up && SQL_CLAUSES[up]) { newline(level); cur += tok.v; betweenPending = false; continue; }
      if (up && SQL_JOINS[up]) { newline(level); cur += tok.v; betweenPending = false; continue; }
      if (up === 'ON') { newline(contIndent()); cur += 'ON'; betweenPending = false; continue; }
      if (up === 'AND' || up === 'OR') {
        if (betweenPending) { append(tok, prev); betweenPending = false; }
        else { newline(contIndent()); cur += tok.v; }
        continue;
      }
      if (up === 'BETWEEN') { append(tok, prev); betweenPending = true; continue; }
      if (up === 'WHEN') { newline(contIndent()); cur += 'WHEN'; continue; }
      if (up === 'ELSE') { newline(contIndent()); cur += 'ELSE'; continue; }
      if (up === 'END') {
        if (trimEnd(cur) !== '') newline(level);
        else cur = ind(level);
        cur += 'END';
        continue;
      }
      if (tok.v === '(') {
        // 函数调用：COUNT(、CAST(……；其余是子查询或列表，按块处理
        var isFunc = prev && prev.t === 'word' && !SQL_CLAUSES[prev.v] && !SQL_JOINS[prev.v] && prev.v !== 'ON' && prev.v !== 'IN' && prev.v !== 'EXISTS';
        if (isFunc) { append(tok, prev); parenStack.push('func'); }
        else {
          if (trimEnd(cur) !== '') cur += ' ';
          cur += '(';
          parenStack.push('block');
          level++;
          newline(level);
        }
        continue;
      }
      if (tok.v === ')') {
        var kind = parenStack.pop() || 'block';
        if (kind === 'func') { cur += ')'; }
        else {
          level = Math.max(0, level - 1);
          if (trimEnd(cur) !== '') newline(level);
          else cur = ind(level);
          cur += ')';
        }
        continue;
      }
      if (tok.v === ',') {
        cur += ',';
        var top = parenStack.length ? parenStack[parenStack.length - 1] : 'block';
        if (top === 'block') newline(contIndent());
        continue;
      }
      if (tok.v === ';') { cur += ';'; newline(0); continue; }
      append(tok, prev);
    }
    if (trimEnd(cur) !== '') lines.push(trimEnd(cur));
    return lines.join('\n');
  }

  /* SQL 压缩：空白压成单个空格，注释去掉，压成一行 */
  function collapseSql(text) {
    var tokens = combineSqlKeywords(tokenizeSql(text));
    var out = '';
    var prev = null;
    tokens.forEach(function (tok) {
      if (tok.t === 'comment') return;
      if (tok.t === 'word') {
        var up = tok.v.toUpperCase();
        if (SQL_KEYWORDS[up]) tok.v = up;
      }
      if (out === '') out = tok.v;
      else if (tok.v === ',' || tok.v === ';' || tok.v === ')' || tok.v === '.') out += tok.v;
      else if (prev && (prev.v === '(' || prev.v === '.')) out += tok.v;
      else out += ' ' + tok.v;
      prev = tok;
    });
    return out;
  }

  /* ---------- Python 整理 ---------- */
  // 保守整理：去行尾空格、空行最多留 2 行、按块结构重排缩进（以冒号开头的块
  // 为准，原始缩进只用来判断回退）。不碰运算符间距、不改语义。
  function measureIndent(line) {
    var m = line.match(/^[ \t]*/)[0];
    var w = 0;
    for (var i = 0; i < m.length; i++) w += m[i] === '\t' ? 4 : 1;
    return w;
  }

  function countBrackets(code) {
    var d = 0;
    for (var i = 0; i < code.length; i++) {
      var c = code[i];
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') d--;
    }
    return d;
  }

  // 把一行的字符串内容和注释替换成空格（保留引号和分隔符），返回处理后的
  // 代码行和三引号状态；供缩进判断和括号计数用
  function blankPythonLine(line, triple) {
    var out = '', i = 0, n = line.length;
    var state = triple ? 'triple' : 'code';
    var q3 = triple;
    while (i < n) {
      var c = line[i];
      if (state === 'code') {
        if (c === '#') { out += repeatStr(' ', n - i); break; }
        if (line.substr(i, 3) === "'''" || line.substr(i, 3) === '"""') {
          var q = line.substr(i, 3);
          out += q; i += 3;
          var j = line.indexOf(q, i);
          if (j === -1) { out += repeatStr(' ', n - i); return { code: out, triple: q }; }
          out += repeatStr(' ', j - i) + q; i = j + 3;
          continue;
        }
        if (c === "'" || c === '"') {
          var q1 = c; out += c; i++;
          while (i < n && line[i] !== q1) {
            if (line[i] === '\\') { out += '  '; i += 2; continue; }
            out += ' '; i++;
          }
          if (i < n) { out += q1; i++; }
          continue;
        }
        out += c; i++;
      } else {
        var k = line.indexOf(q3, i);
        if (k === -1) { out += repeatStr(' ', n - i); return { code: out, triple: q3 }; }
        out += repeatStr(' ', k - i) + q3; i = k + 3;
        state = 'code';
      }
    }
    return { code: out, triple: state === 'triple' ? q3 : null };
  }

  /* 输入自身的缩进单位：取第一个有缩进的行的宽度（超过 8 格视为异常，
     用配置的缩进代替）。原始缩进只用来判断「回退到外层」，必须按输入
     自己的单位量，否则 4 格缩进的文件在 2 格设置下会被误判层级。 */
  function detectIndentUnit(lines, fallback) {
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^ +/);
      if (m) {
        if (m[0].length <= 8) return m[0].length;
      } else if (/^\t/.test(lines[i])) {
        return 4;
      }
    }
    return fallback;
  }

  function formatPython(text, indentStr) {
    var bal = checkBalance(text, 'python');
    if (bal) throw new Error(bal.message);
    var rawLines = text.replace(/\r\n?/g, '\n').split('\n');
    var unitWidth = detectIndentUnit(rawLines, indentStr === '\t' ? 4 : indentStr.length);
    var out = [];
    var level = 0, blanks = 0, triple = null, openDepth = 0;
    var prevEndsColon = false, prevCont = false;
    for (var i = 0; i < rawLines.length; i++) {
      var line = rawLines[i];
      var stripped = line.replace(/^\s+/, '').replace(/\s+$/, '');
      if (triple) {
        out.push(line.replace(/\s+$/, ''));
        triple = blankPythonLine(line, triple).triple;
        blanks = 0;
        continue;
      }
      if (stripped === '') {
        blanks++;
        if (blanks <= 2) out.push('');
        continue;
      }
      blanks = 0;
      var scan = blankPythonLine(line, null);
      var code = scan.code;
      var lead = measureIndent(line);
      var eff = level;
      // 原始缩进只用来判断「回退到外层」：上一行不是新块开头、也不在续行里时才采信
      if (openDepth === 0 && !prevCont && !prevEndsColon) {
        var hint = Math.floor(lead / unitWidth);
        if (hint < level) level = hint;
        eff = level;
      }
      if (/^(elif|else|except|finally)\b/.test(stripped)) eff = Math.max(0, level - 1);
      else if (/^[\)\]\}]/.test(stripped)) eff = Math.max(0, level - 1);
      var newDepth = openDepth + countBrackets(code);
      var endsBackslash = /\\$/.test(code.replace(/\s+$/, ''));
      if (prevCont) {
        var origLead = line.slice(0, line.length - line.replace(/^\s+/, '').length);
        out.push(origLead + stripped);
      } else {
        out.push(repeatStr(indentStr, eff) + stripped);
      }
      if (/^(elif|else|except|finally)\b/.test(stripped)) level = eff;
      else if (/^[\)\]\}]/.test(stripped)) level = eff;
      else level = eff;
      var endsColon = /:\s*$/.test(code);
      if (endsColon && openDepth === 0 && newDepth === 0 && !prevCont) level = eff + 1;
      prevEndsColon = endsColon;
      prevCont = (newDepth > 0) || endsBackslash;
      openDepth = newDepth;
      if (scan.triple) triple = scan.triple;
    }
    while (out.length && out[0] === '') out.shift();
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n');
  }

  /* Python 缩进检查：Tab 和空格混用、缩进一次跳超过一级 */
  function checkPythonIndent(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var unit = detectIndentUnit(lines, getIndent() === '\t' ? 4 : Number(getIndent()));
    var triple = null, openDepth = 0, prevIndent = 0, prevEndsColon = false, prevCont = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var scan = blankPythonLine(line, triple);
      triple = scan.triple;
      if (triple) continue;
      var stripped = line.replace(/^\s+/, '').replace(/\s+$/, '');
      if (!stripped) continue;
      var lead = line.match(/^\s*/)[0];
      if (/\t/.test(lead) && / /.test(lead)) return '第 ' + (i + 1) + ' 行缩进混用了 Tab 和空格';
      var spaces = measureIndent(line);
      if (!prevCont && !prevEndsColon && openDepth === 0 && spaces > prevIndent + unit) {
        return '第 ' + (i + 1) + ' 行缩进异常：比上一行多缩进超过一级';
      }
      var code = scan.code;
      openDepth += countBrackets(code);
      prevEndsColon = /:\s*$/.test(code) && openDepth === 0;
      prevCont = openDepth > 0 || /\\$/.test(code.replace(/\s+$/, ''));
      prevIndent = spaces;
    }
    return null;
  }

  /* ---------- Go / Java 格式化（C 风格） ---------- */
  // 按大括号定缩进、分号换行、逗号后留空格、控制关键字后留空格；保留用户
  // 的空行（最多 1 行）；字符串、字符、注释原样保留。运算符间距只做保守
  // 处理（* & - ! 在一元语境下不留空格），不做完整语义分析。
  function tokenizeC(text, lang) {
    var tokens = [], i = 0, n = text.length;
    while (i < n) {
      var c = text[i];
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '\n') {
        var j = i, newlines = 0;
        while (j < n && (text[j] === ' ' || text[j] === '\t' || text[j] === '\r' || text[j] === '\n')) {
          if (text[j] === '\n') newlines++;
          j++;
        }
        // 单个换行是语句分隔符（Go 靠换行断句，Java 的 import 也一样），
        // 必须保留成 nl token；两个以上换行记为空行
        if (newlines >= 2) tokens.push({ t: 'blank', v: '' });
        else tokens.push({ t: 'nl', v: '' });
        i = j; continue;
      }
      if (c === '/' && text[i + 1] === '/') {
        var lc = text.indexOf('\n', i);
        if (lc === -1) lc = n;
        tokens.push({ t: 'comment', v: text.slice(i, lc) });
        i = lc; continue;
      }
      if (c === '/' && text[i + 1] === '*') {
        var bc = text.indexOf('*/', i + 2);
        if (bc === -1) bc = n - 2;
        tokens.push({ t: 'comment', v: text.slice(i, bc + 2) });
        i = bc + 2; continue;
      }
      if (c === '"') {
        if (lang === 'java' && text.substr(i, 3) === '"""') {
          var tb = text.indexOf('"""', i + 3);
          if (tb === -1) tb = n - 3;
          tokens.push({ t: 'string', v: text.slice(i, tb + 3) });
          i = tb + 3; continue;
        }
        var s = i + 1;
        while (s < n && text[s] !== '"' && text[s] !== '\n') { if (text[s] === '\\') s++; s++; }
        if (s < n && text[s] === '"') s++;
        tokens.push({ t: 'string', v: text.slice(i, s) });
        i = s; continue;
      }
      if (c === "'") {
        var ch = i + 1;
        while (ch < n && text[ch] !== "'" && text[ch] !== '\n') { if (text[ch] === '\\') ch++; ch++; }
        if (ch < n && text[ch] === "'") ch++;
        tokens.push({ t: 'string', v: text.slice(i, ch) });
        i = ch; continue;
      }
      if (c === '`' && lang === 'go') {
        var bt = text.indexOf('`', i + 1);
        if (bt === -1) bt = n - 1;
        tokens.push({ t: 'string', v: text.slice(i, bt + 1) });
        i = bt + 1; continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        var w = i;
        while (w < n && /[A-Za-z0-9_$]/.test(text[w])) w++;
        tokens.push({ t: 'word', v: text.slice(i, w) });
        i = w; continue;
      }
      if (/[0-9]/.test(c)) {
        var d = i;
        while (d < n && /[0-9A-Za-z_.]/.test(text[d])) d++;
        tokens.push({ t: 'num', v: text.slice(i, d) });
        i = d; continue;
      }
      var three = text.substr(i, 3);
      if (three === '...' || three === '<<=' || three === '>>=') {
        tokens.push({ t: 'op', v: three });
        i += 3; continue;
      }
      var two = text.substr(i, 2);
      if (two === '++' || two === '--' || two === '+=' || two === '-=' || two === '*=' || two === '/=' || two === '%=' || two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||' || two === '->' || two === '::' || two === '<<' || two === '>>' || two === '&=' || two === '|=' || two === '^=' || two === '=>') {
        tokens.push({ t: 'op', v: two });
        i += 2; continue;
      }
      tokens.push({ t: 'punct', v: c });
      i++;
    }
    return tokens;
  }

  function formatCStyle(text, indentStr, lang) {
    var bal = checkBalance(text, 'c');
    if (bal) throw new Error(bal.message);
    var tokens = tokenizeC(text, lang);
    var lines = [];
    var cur = '';
    var level = 0, paren = 0, inCase = false, casePending = false, breakPending = false;
    var anno = 0; // 0 无 | 1 见到 @ | 2 注解名后 | 3 注解参数括号里
    var CONTROL = { 'if': 1, 'for': 1, 'while': 1, 'switch': 1, 'catch': 1, 'return': 1, 'func': 1, 'synchronized': 1 };
    function ind(lv) { return repeatStr(indentStr, lv); }
    function stmtLevel() { return level + (inCase ? 1 : 0); }
    function hasContent() { return cur.replace(/\s+$/, '') !== ''; }
    function newline(lv) {
      if (hasContent()) lines.push(cur);
      cur = ind(lv);
    }
    // token 前面是否需要一个空格
    function isUnaryContext(tok) {
      if (!tok) return true;
      if (tok.t === 'op' && tok.v !== '++' && tok.v !== '--') return true;
      var v = tok.v;
      return v === '(' || v === '[' || v === ',' || v === '=' || v === ':' || v === '{' || v === ';' || v === 'return' || v === 'case';
    }
    function spaceBefore(tok, prev, prevPrev) {
      if (!prev) return false;
      var v = tok.v;
      if (v === ',' || v === ';' || v === ')' || v === ']' || v === '.' || v === '::' || v === '...' || v === ':') return false;
      if (v === '++' || v === '--') return !(prev.t === 'word' || prev.t === 'num' || prev.v === ')' || prev.v === ']' || prev.v === '++' || prev.v === '--');
      if (prev.v === '(' || prev.v === '[' || prev.v === '.' || prev.v === '::' || prev.v === '...' || prev.v === '++' || prev.v === '--') return false;
      if ((v === '*' || v === '&' || v === '-' || v === '!') && isUnaryContext(prev)) return false;
      if ((prev.v === '*' || prev.v === '&' || prev.v === '-' || prev.v === '!' || prev.v === '+') && isUnaryContext(prevPrev)) return false;
      if (v === '(') return !!CONTROL[prev.v];
      if (v === '[') return !(prev.t === 'word' || prev.t === 'num' || prev.v === ')' || prev.v === ']');
      return true;
    }
    // 带换行的原文拼接：字符串 token 里可能自带换行（Go 反引号、Java 文本块）
    function appendRaw(v) {
      var parts = v.split('\n');
      cur += parts[0];
      for (var k = 1; k < parts.length; k++) { lines.push(cur); cur = parts[k]; }
    }
    var lastTok = null, lastLastTok = null, annoParen = 0;
    // 换行是否只是续行（不断行）：上一个 token 是运算符/逗号/开括号等，
    // 或下一个 token 是运算符/逗号/点/闭括号/else 等
    function isContPrev(tok) {
      if (!tok) return false;
      if (tok.t === 'op' && tok.v !== '++' && tok.v !== '--') return true;
      return tok.v === ',' || tok.v === '.' || tok.v === '(' || tok.v === '[' || tok.v === '{' || tok.v === '?' || tok.v === ':';
    }
    function isContNext(tok) {
      if (!tok) return false;
      if (tok.t === 'op' && tok.v !== '++' && tok.v !== '--') return true;
      return tok.v === ',' || tok.v === '.' || tok.v === '?' || tok.v === ':' || tok.v === ')' || tok.v === ']' || tok.v === '}' || tok.v === 'else' || tok.v === 'catch' || tok.v === 'finally' || tok.v === 'while';
    }
    for (var ti = 0; ti < tokens.length; ti++) {
      var tok = tokens[ti];
      if (tok.t === 'nl') {
        // 换行断句：当前行有内容、不是续行时才换行
        if (!hasContent()) continue;
        if (isContPrev(lastTok)) continue;
        if (isContNext(tokens[ti + 1])) continue;
        newline(stmtLevel());
        continue;
      }
      if (tok.t === 'blank') {
        if (hasContent()) { newline(stmtLevel()); lines.push(''); }
        continue;
      }
      if (breakPending) {
        if (tok.v !== 'else' && tok.v !== 'catch' && tok.v !== 'finally' && tok.v !== 'while' && tok.v !== ';' && tok.v !== ',' && tok.v !== '.') {
          newline(stmtLevel());
        }
        breakPending = false;
      }
      // Java 注解：@Override 这类单独成行
      if (anno === 2 && tok.v !== '(') {
        newline(stmtLevel());
        anno = 0;
      }
      if (tok.v === '{') {
        if (!hasContent()) cur += '{';
        else cur += ' {';
        level++;
        newline(level);
        lastLastTok = lastTok; lastTok = tok;
        continue;
      }
      if (tok.v === '}') {
        level = Math.max(0, level - 1);
        inCase = false;
        if (hasContent()) newline(level);
        cur = ind(level);
        appendRaw('}');
        breakPending = true;
        lastLastTok = lastTok; lastTok = tok;
        continue;
      }
      if (tok.v === 'case' || tok.v === 'default') {
        inCase = false;
        if (hasContent()) newline(level);
        cur = ind(level);
        appendRaw(tok.v);
        casePending = true;
        lastLastTok = lastTok; lastTok = tok;
        continue;
      }
      if (tok.v === ':' && casePending) {
        appendRaw(':');
        casePending = false;
        newline(level + 1);
        inCase = true;
        lastLastTok = lastTok; lastTok = tok;
        continue;
      }
      if (tok.v === ';') {
        appendRaw(';');
        if (paren === 0) newline(stmtLevel());
        lastLastTok = lastTok; lastTok = tok;
        continue;
      }
      if (tok.v === '(') { paren++; }
      if (tok.v === ')') { paren = Math.max(0, paren - 1); }
      if (tok.v === '@') anno = 1;
      else if (anno === 1 && tok.t === 'word') anno = 2;
      if (tok.t === 'comment' && tok.v.indexOf('//') === 0) {
        if (!hasContent()) cur = ind(stmtLevel());
        else cur += ' ';
        appendRaw(tok.v);
        newline(stmtLevel());
        lastLastTok = lastTok; lastTok = tok;
        continue;
      }
      if (!hasContent() && tok.v !== '{') {
        // 行首：cur 已是缩进，直接拼接
        appendRaw(tok.v);
      } else {
        if (spaceBefore(tok, lastTok, lastLastTok)) cur += ' ';
        appendRaw(tok.v);
      }
      if (anno === 3 && tok.v === ')' && paren === annoParen - 1) { anno = 0; newline(stmtLevel()); }
      else if (anno === 1 && tok.v === '(') { anno = 3; annoParen = paren; }
      lastLastTok = lastTok; lastTok = tok;
    }
    if (hasContent()) lines.push(cur);
    while (lines.length && lines[0] === '') lines.shift();
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n');
  }

  /* ---------- 括号 / 引号 / 注释配对检查（SQL / Python / Go / Java 共用） ---------- */
  function checkBalance(text, lang) {
    var stack = [];
    var i = 0, n = text.length, line = 1, col = 1;
    var state = 'code'; // code | squote | dquote | bquote | bracket | lineComment | blockComment | tripleS | tripleD
    var strLine = 0, strCol = 0;
    while (i < n) {
      var c = text[i];
      var curLine = line, curCol = col;
      var step = 1;
      if (state === 'code') {
        if (lang === 'python' && c === '#') { state = 'lineComment'; }
        else if ((lang === 'c' || lang === 'sql') && c === '/' && text[i + 1] === '/') { state = 'lineComment'; step = 2; }
        else if ((lang === 'c' || lang === 'sql') && c === '/' && text[i + 1] === '*') { state = 'blockComment'; step = 2; }
        else if (lang === 'python' && (text.substr(i, 3) === "'''" || text.substr(i, 3) === '"""')) {
          state = text[i] === "'" ? 'tripleS' : 'tripleD';
          strLine = curLine; strCol = curCol; step = 3;
        }
        else if (c === "'") { state = 'squote'; strLine = curLine; strCol = curCol; }
        else if (c === '"') { state = 'dquote'; strLine = curLine; strCol = curCol; }
        else if (lang !== 'python' && c === '`') { state = 'bquote'; strLine = curLine; strCol = curCol; }
        else if (lang === 'sql' && c === '[') { state = 'bracket'; strLine = curLine; strCol = curCol; }
        else if (c === '(' || c === '[' || c === '{') { stack.push({ ch: c, line: curLine, col: curCol }); }
        else if (c === ')' || c === ']' || c === '}') {
          var open = c === ')' ? '(' : c === ']' ? '[' : '{';
          if (!stack.length || stack[stack.length - 1].ch !== open) {
            return { line: curLine, col: curCol, message: '括号不匹配：第 ' + curLine + ' 行第 ' + curCol + ' 列的 ' + c + ' 没有对应的开括号' };
          }
          stack.pop();
        }
      } else if (state === 'lineComment') {
        if (c === '\n') state = 'code';
      } else if (state === 'blockComment') {
        if (c === '*' && text[i + 1] === '/') { state = 'code'; step = 2; }
      } else if (state === 'squote' || state === 'dquote' || state === 'bquote' || state === 'bracket') {
        var q = state === 'squote' ? "'" : state === 'dquote' ? '"' : state === 'bquote' ? '`' : ']';
        if (c === '\\' && state !== 'bracket') { step = 2; }
        else if (c === q && text[i + 1] === q && (state === 'squote' || state === 'dquote')) { step = 2; }
        else if (c === q) { state = 'code'; }
        else if (c === '\n' && state !== 'bquote') {
          return { line: strLine, col: strCol, message: '字符串未闭合：第 ' + strLine + ' 行第 ' + strCol + ' 列的引号没有闭合' };
        }
      } else if (state === 'tripleS' || state === 'tripleD') {
        var q3 = state === 'tripleS' ? "'''" : '"""';
        if (text.substr(i, 3) === q3) { state = 'code'; step = 3; }
      }
      for (var s = 0; s < step; s++) {
        var ch = text[i + s];
        if (ch === '\n') { line++; col = 1; } else col++;
      }
      i += step;
    }
    if (state === 'blockComment') return { line: line, col: col, message: '注释未闭合：/* 没有对应的 */' };
    if (state === 'squote' || state === 'dquote' || state === 'bquote' || state === 'bracket' || state === 'tripleS' || state === 'tripleD') {
      return { line: strLine, col: strCol, message: '字符串未闭合：第 ' + strLine + ' 行第 ' + strCol + ' 列的引号没有闭合' };
    }
    if (stack.length) {
      var t = stack[stack.length - 1];
      return { line: t.line, col: t.col, message: '括号未闭合：第 ' + t.line + ' 行第 ' + t.col + ' 列的 ' + t.ch + ' 没有对应的闭括号' };
    }
    return null;
  }

  /* ---------- 多语言分发 ---------- */
  /* ---------- SQL 真解析器（sql-formatter，本地 vendor） ---------- */
  // sql-formatter 15.x：format(sql, { language, keywordCase, tabWidth/useTabs })。
  // 它是格式化器不是严格校验器：SELECT FROM WHERE 这类语义错句它也照
  // 常格式化，只有放错位置的 token（括号不配对、BETWEEN 缺值等）才会抛
  // 错；抛错信息自带几十 KB 的文法展开，必须只取首行。
  var sqlFallbackUsed = false; // 本次格式化是否回退到了轻量版
  function sqlFormatOpts() {
    var opts = { language: 'sql', keywordCase: 'upper' };
    var u = indentString();
    if (u === '\t') opts.useTabs = true;
    else opts.tabWidth = u.length;
    return opts;
  }
  function formatSqlReal(text) {
    return sqlFormatter.format(text, sqlFormatOpts());
  }
  function sqlParseError(e) {
    var msg = (e && e.message) ? e.message : String(e);
    var first = msg.split('\n')[0];
    var m = /Parse error at token: (.*?) at line (\d+) column (\d+)/.exec(first);
    if (m) return 'SQL 语法错误：第 ' + m[2] + ' 行第 ' + m[3] + ' 列附近，意外的 ' + (m[1] || '内容');
    return 'SQL 语法错误：' + first;
  }

  function formatCode(lang, text) {
    var u = indentString();
    if (lang === 'sql') {
      sqlFallbackUsed = false;
      if (typeof sqlFormatter !== 'undefined') {
        try {
          return formatSqlReal(text);
        } catch (e) {
          // 真解析器拒收（方言语法或语句有误）：回退轻量版照常出结果，
          // 状态栏会注明是轻量模式；严格报错走验证按钮
          sqlFallbackUsed = true;
          return formatSql(text, u);
        }
      }
      sqlFallbackUsed = true;
      return formatSql(text, u);
    }
    if (lang === 'python') return formatPython(text, u);
    if (lang === 'go') return formatCStyle(text, u, 'go');
    if (lang === 'java') return formatCStyle(text, u, 'java');
    return text;
  }

  function validateCode(lang, text) {
    var bal = checkBalance(text, lang === 'python' ? 'python' : lang === 'sql' ? 'sql' : 'c');
    if (bal) return { ok: false, message: bal.message };
    if (lang === 'python') {
      var ind = checkPythonIndent(text);
      if (ind) return { ok: false, message: ind };
      return { ok: true, message: 'Python 结构检查通过：括号、引号、缩进正常（非完整语法校验）' };
    }
    if (lang === 'sql') {
      if (typeof sqlFormatter !== 'undefined') {
        try {
          sqlFormatter.format(text, sqlFormatOpts());
          return { ok: true, message: 'SQL 语法检查通过：sql-formatter 解析成功（标准 SQL 方言）' };
        } catch (e) {
          return { ok: false, message: sqlParseError(e) };
        }
      }
      return { ok: true, message: 'SQL 结构检查通过：括号、引号配对正常（非完整语法校验）' };
    }
    return { ok: true, message: LANGS[lang] + ' 结构检查通过：括号、引号配对正常（非完整语法校验）' };
  }

  function downloadName(lang) {
    return { json: 'formatted.json', sql: 'query.sql', python: 'main.py', go: 'main.go', java: 'Main.java' }[lang] || 'formatted.txt';
  }

  function fenceLang() {
    if (outputMode === 'ts') return 'typescript';
    if (outputMode === 'yaml') return 'yaml';
    if (outputMode === 'go') return 'go';
    if (outputMode === 'py') return 'python';
    if (outputMode === 'text') return currentLang;
    return 'json';
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
    if (currentLang !== 'json') {
      var text = input.value;
      if (!text.trim()) { setStatus('warn', '输入为空，请粘贴代码'); return; }
      try {
        var formatted = formatCode(currentLang, text);
        lastValue = null;
        showOutput(formatted, { mode: 'text', download: downloadName(currentLang), stats: formatted.length + ' 字符' });
        detailStats.textContent = LANGS[currentLang] + ' · ' + formatted.split('\n').length + ' 行';
        setStatus('ok', currentLang === 'sql' && sqlFallbackUsed
          ? 'SQL 格式化成功（轻量模式：真解析器无法解析这段 SQL，可能是方言语法或语句有误）'
          : LANGS[currentLang] + ' 格式化成功');
        saveHistory(text);
      } catch (e) {
        setStatus('err', e.message);
      }
      return;
    }
    var r = parseInput();
    if (r) applyResult(r.value, 'format');
  }

  function doMinify() {
    if (currentLang === 'sql') {
      var sqlText = input.value;
      if (!sqlText.trim()) { showToast('输入为空，先粘贴 SQL'); return; }
      var min = collapseSql(sqlText);
      lastValue = null;
      showOutput(min, { mode: 'text', download: 'query.sql', stats: min.length + ' 字符' });
      detailStats.textContent = 'SQL · 已压成一行';
      setStatus('ok', '已压缩成一行');
      saveHistory(sqlText);
      return;
    }
    if (currentLang !== 'json') { showToast(LANGS[currentLang] + ' 不支持压缩'); return; }
    var r = parseInput();
    if (r) applyResult(r.value, 'minify');
  }

  function doValidate() {
    if (currentLang !== 'json') {
      var text = input.value;
      if (!text.trim()) { setStatus('warn', '输入为空，请粘贴代码'); return; }
      var res = validateCode(currentLang, text);
      if (res.ok) {
        lastValue = null;
        lastFormatted = text;
        outputMode = 'text';
        setStatus('ok', res.message);
        outputStats.textContent = '结构正常';
        detailStats.textContent = LANGS[currentLang] + ' · ' + text.split('\n').length + ' 行';
        saveHistory(text);
      } else {
        setStatus('err', res.message);
        outputStats.textContent = '检查未通过';
        detailStats.textContent = '';
      }
      return;
    }
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

  /* ---------- 输入草稿自动保存 ---------- */
  // 输入框内容每改一次防抖 300ms 写进 localStorage，刷新 / 下次打开自动
  // 恢复；分享链接（#j=）优先于草稿；点「清空」时会把草稿一起清掉。
  // 挂在 updateGutter 里：所有改输入的入口（打字、粘贴、打开文件、示例、
  // 历史、清空）最后都会走 updateGutter，一处就全覆盖了。
  var DRAFT_KEY = 'json-wb-draft';
  var DRAFT_MAX = 1000000; // 超过 1MB 不存，避免撑爆 localStorage
  var draftTimer = null;
  function saveDraft() {
    var text = input.value;
    try {
      if (text.length > DRAFT_MAX) return;
      if (text) localStorage.setItem(DRAFT_KEY, text);
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) {}
  }
  function scheduleDraftSave() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 300);
  }
  function restoreDraft() {
    var text = '';
    try { text = localStorage.getItem(DRAFT_KEY) || ''; } catch (e) {}
    if (text && !input.value) {
      input.value = text;
      updateGutter();
      setStatus('idle', '已恢复上次的草稿');
    }
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

  // 清空历史记录：删掉 localStorage 里的 json-wb-history，下拉恢复成空；
  // 只清历史，不动当前输入框里的内容（那份草稿由输入框的「清空」管）
  function clearHistory() {
    try { localStorage.removeItem('json-wb-history'); } catch (e) {}
    renderHistory();
    showToast('已清空历史记录');
  }

  $('btnClearHistory').addEventListener('click', function () {
    clearHistory();
    closeMore();
  });

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
    scheduleDraftSave();
    // 自动检测模式下，输入一变就重新猜语言（打字、粘贴、载入文件、恢复
    // 草稿都会走这里）；手动锁定了语言时不猜
    if (langMode === 'auto') {
      var d = detectLanguage(input.value);
      if (d && d !== currentLang) { currentLang = d; updateLangUI(); }
    }
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
    var highlighted;
    if (outputMode === 'json') highlighted = highlight(lastFormatted);
    else if (outputMode === 'text' && currentLang === 'sql') highlighted = highlightSql(lastFormatted);
    else return null; // 其他语言暂无高亮
    if (highlighted.indexOf('<span class="k">') === -1 &&
        highlighted.indexOf('<span class="s">') === -1) return null;
    var colors = {
      k: themeVar('--key') || '#82aaff',
      s: themeVar('--string') || '#ecc48d',
      n: themeVar('--number') || '#f78c6c',
      b: themeVar('--bool') || '#c792ea',
      u: themeVar('--null') || '#ff5370',
      p: themeVar('--punct') || themeVar('--muted') || '#89ddff',
      c: themeVar('--muted') || '#888888'
    };
    var rich = highlighted
      .replace(/<span class="k">/g, '<span style="color:' + colors.k + '">')
      .replace(/<span class="s">/g, '<span style="color:' + colors.s + '">')
      .replace(/<span class="n">/g, '<span style="color:' + colors.n + '">')
      .replace(/<span class="b">/g, '<span style="color:' + colors.b + '">')
      .replace(/<span class="u">/g, '<span style="color:' + colors.u + '">')
      .replace(/<span class="p">/g, '<span style="color:' + colors.p + '">')
      .replace(/<span class="c">/g, '<span style="color:' + colors.c + '">');
    var bg = themeVar('--panel') || themeVar('--bg') || '#171a21';
    var fg = themeVar('--text') || '#e6e8ec';
    return '<pre style="background:' + bg + ';color:' + fg +
      ';font-family:Menlo,Consolas,\'Courier New\',monospace;font-size:13px;' +
      'line-height:1.6;margin:0;padding:12px;white-space:pre;"><code>' +
      rich + '</code></pre>';
  }

  function copyFormatted() {
    if (!lastFormatted) { showToast('没有可复制的内容，先格式化一次'); return; }
    // JSON 和 SQL 输出带高亮，其余（YAML、对比结果、Python/Go/Java 等）
    // 没有高亮，直接走纯文本
    if (outputMode !== 'json' && !(outputMode === 'text' && currentLang === 'sql')) { copyText(lastFormatted); return; }
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

  /* ---------- 复制为 Markdown 代码块 ---------- */
  // text/plain 写 ```围栏：粘到纯文本 / Markdown 编辑器里是代码块；
  // text/html 写带颜色的 <pre>：粘到 Notion / Jira / Word / 邮件里认作
  // 代码块（Notion、Jira 会按语言自己上色，Word、邮件保留主题颜色）。
  // 带颜色只对 JSON 和 SQL 生效，其余语言只有围栏纯文本。
  function copyMarkdown() {
    if (!lastFormatted) { showToast('没有可复制的内容，先格式化一次'); return; }
    var lang = fenceLang();
    var fenced = '```' + lang + '\n' + lastFormatted + '\n```';
    if (outputMode === 'json' || (outputMode === 'text' && currentLang === 'sql')) {
      var richHtml = buildRichHtml();
      if (richHtml && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        var item = new ClipboardItem({
          'text/html': new Blob([richHtml], { type: 'text/html' }),
          'text/plain': new Blob([fenced], { type: 'text/plain' })
        });
        navigator.clipboard.write([item]).then(
          function () { showToast('已复制 Markdown 代码块'); },
          function () { copyText(fenced); }
        );
        return;
      }
    }
    copyText(fenced);
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

  /* ---------- 各语言示例 ---------- */
  var SAMPLES = {
    sql: "SELECT id, name, total FROM orders JOIN users ON orders.user_id = users.id WHERE total > 100 AND status = 'paid' GROUP BY id, name ORDER BY total DESC LIMIT 10;",
    python: 'def total(items):\n    s = 0\n    for it in items:\n          s += it["price"] * it["qty"]\n    return s\n\n\ndef main():\n    cart = [{"price": 9, "qty": 2}, {"price": 5, "qty": 3}]\n    print(total(cart))',
    go: 'package main\nimport "fmt"\nfunc main() {\nfmt.Println("hello")\nif true {\nfmt.Println("yes")\n}\n}',
    java: 'public class Hello {\npublic static void main(String[] args) {\nSystem.out.println("hello");\nif (args.length > 0) {\nSystem.out.println(args[0]);\n} else {\nSystem.out.println("no args");\n}\n}\n}'
  };

  /* ---------- 快捷键 ---------- */
  // 注册表：改键只改 combo，行为由 run 决定；allowEditable 表示焦点在
  // 输入框里时是否仍然生效（比如 Ctrl+Enter 在输入框里也要能格式化）
  var SHORTCUTS = [
    { id: 'format', name: '格式化', combo: 'ctrl+enter', allowEditable: true, run: doFormat },
    { id: 'selectResult', name: '选中格式化结果', combo: 'ctrl+a', allowEditable: false, run: selectResult },
    { id: 'copyResult', name: '复制结果（带颜色）', combo: 'ctrl+alt+c', allowEditable: true, run: copyFormatted },
    { id: 'copyMarkdown', name: '复制为 Markdown 代码块', combo: 'ctrl+alt+m', allowEditable: true, run: copyMarkdown },
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
  // 点菜单里的动作项后自动收起菜单（下拉框 / 勾选行不收）
  $('moreMenu').addEventListener('click', function (e) {
    if (e.target.closest('.menu-item')) closeMore();
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
      closeBrand();
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
    var defaults = { format: 'ctrl+enter', selectResult: 'ctrl+a', copyResult: 'ctrl+alt+c', copyMarkdown: 'ctrl+alt+m', toggleTree: 'ctrl+l', openSettings: 'ctrl+alt+s' };
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
    if (currentLang !== 'json') { showToast('树形视图只支持 JSON'); return; }
    if (lastValue === null) { showToast('先格式化或验证一次，再看树形视图'); return; }
    setView('tree');
  });

  $('btnCopy').addEventListener('click', function () {
    copyFormatted();
  });
  $('btnCopyMarkdown').addEventListener('click', copyMarkdown);
  $('btnDownload').addEventListener('click', downloadJson);

  /* ---------- 树形搜索绑定 ---------- */
  $('treeSearch').addEventListener('input', function () { filterTree(this.value); });
  $('treeSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); clearTreeSearch(); }
  });
  $('btnTreeSearchClear').addEventListener('click', function () {
    clearTreeSearch();
    $('treeSearch').focus();
  });

  $('btnClear').addEventListener('click', function () {
    input.value = '';
    lastValue = null;
    lastFormatted = '';
    outputMode = 'json';
    lastDownloadName = 'formatted.json';
    output.innerHTML = '<code>' + outputPlaceholder() + '</code>';
    tree.innerHTML = '';
    outputStats.textContent = '等待输入';
    detailStats.textContent = '';
    setStatus('idle', '已清空');
    updateGutter();
    input.focus();
  });

  $('btnSample').addEventListener('click', function () {
    input.value = currentLang === 'json' ? JSON.stringify(SAMPLE, null, 2) : SAMPLES[currentLang];
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
    loadLangMode();
    $('langSelect').value = langMode;
    updateLangUI();
    updateGutter();
    restoreDraft();
    loadFromHash();
  })();
})();
