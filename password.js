/* 密码生成器：随机强密码、BIP39 助记词、随机数，外加「检查我的密码」。
   纯静态零后端；随机数用浏览器内置的安全随机数（crypto.getRandomValues）本地生成。
   助记词按 BIP39 标准：2048 个官方单词（bip39-words.js，本地 vendor），带校验和，
   12/15/18/21/24 词；校验和用 crypto.subtle 算 SHA-256。
   生成的密码/助记词/随机数不会保存到任何地方，刷新页面就消失；只记选项。 */
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

  /* ---------- 主题（与其它页共用 json-wb-theme） ---------- */
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
    if (page && page !== 'password.html') location.href = page;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeBrand();
  });

  /* ---------- 可拖动分隔条（与其它页同款，比例分开存） ---------- */
  (function initResizer() {
    var panes = $('panes'), paneLeft = $('paneLeft'), divider = $('divider');
    var saved = null;
    try { saved = localStorage.getItem('pw-wb-split'); } catch (e) {}
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
            localStorage.setItem('pw-wb-split-v', paneLeft.style.height);
          } else {
            localStorage.setItem('pw-wb-split', parseFloat(paneLeft.style.width));
          }
        } catch (err) {}
      }
      divider.addEventListener('pointermove', onMove);
      divider.addEventListener('pointerup', onUp);
    });
  })();

  /* ---------- 安全随机数（拒绝采样，避免取模偏差） ---------- */
  function randInt(n) {
    if (!window.crypto || !window.crypto.getRandomValues) {
      throw new Error('no crypto');
    }
    if (n <= 0 || n > 4294967296) throw new Error('bad range');
    var max = Math.floor(4294967296 / n) * n;
    var arr = new Uint32Array(1);
    var v;
    do {
      window.crypto.getRandomValues(arr);
      v = arr[0];
    } while (v >= max);
    return v % n;
  }

  var AMBIGUOUS = '0O1lI';
  var SYMBOLS = '!@#$%^&*';

  function currentOptions() {
    return {
      mode: $('modeSelect').value,
      length: Math.min(64, Math.max(8, parseInt($('lengthNum').value, 10) || 16)),
      upper: $('setUpper').checked,
      lower: $('setLower').checked,
      digits: $('setDigits').checked,
      symbols: $('setSymbols').checked,
      excludeAmbiguous: $('excludeAmbiguous').checked,
      mnemonicWords: parseInt($('mnemonicWords').value, 10) || 12,
      numMin: parseInt($('numMin').value, 10) || 0,
      numMax: parseInt($('numMax').value, 10) || 0,
      numCount: Math.min(10, Math.max(1, parseInt($('numCount').value, 10) || 5)),
      numPad: $('numPad').checked,
      numPadDigits: Math.min(10, Math.max(1, parseInt($('numPadDigits').value, 10) || 4))
    };
  }

  /* 选项存在本机（只记选项，不记密码/助记词/随机数） */
  var OPTS_KEY = 'pw-wb-options';
  function saveOptions() {
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(currentOptions())); } catch (e) {}
  }
  function restoreOptions() {
    try {
      var raw = localStorage.getItem(OPTS_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o) return;
      if (o.mode) $('modeSelect').value = o.mode;
      if (o.length) { $('lengthRange').value = o.length; $('lengthNum').value = o.length; $('lengthValue').textContent = o.length; }
      if (typeof o.upper === 'boolean') $('setUpper').checked = o.upper;
      if (typeof o.lower === 'boolean') $('setLower').checked = o.lower;
      if (typeof o.digits === 'boolean') $('setDigits').checked = o.digits;
      if (typeof o.symbols === 'boolean') $('setSymbols').checked = o.symbols;
      if (typeof o.excludeAmbiguous === 'boolean') $('excludeAmbiguous').checked = o.excludeAmbiguous;
      if (o.mnemonicWords) $('mnemonicWords').value = String(o.mnemonicWords);
      if (typeof o.numMin === 'number') $('numMin').value = o.numMin;
      if (typeof o.numMax === 'number') $('numMax').value = o.numMax;
      if (o.numCount) $('numCount').value = o.numCount;
      if (typeof o.numPad === 'boolean') $('numPad').checked = o.numPad;
      if (o.numPadDigits) $('numPadDigits').value = o.numPadDigits;
    } catch (e) {}
  }

  /* ---------- 随机密码 ---------- */
  function buildPool(o) {
    var pool = '';
    if (o.upper) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (o.lower) pool += 'abcdefghijklmnopqrstuvwxyz';
    if (o.digits) pool += '0123456789';
    if (o.symbols) pool += SYMBOLS;
    if (o.excludeAmbiguous) {
      pool = pool.split('').filter(function (c) { return AMBIGUOUS.indexOf(c) === -1; }).join('');
    }
    return pool;
  }

  function genRandom(o) {
    var pool = buildPool(o);
    if (!pool) return null;
    var out = '';
    for (var i = 0; i < o.length; i++) out += pool.charAt(randInt(pool.length));
    return out;
  }

  function randomBits(o) {
    var pool = buildPool(o);
    if (!pool) return 0;
    return o.length * (Math.log(pool.length) / Math.log(2));
  }

  /* ---------- BIP39 助记词 ---------- */
  function sha256(bytes) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error('no subtle crypto'));
    }
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      return new Uint8Array(buf);
    });
  }
  function bytesToBits(bytes) {
    var bits = [];
    for (var i = 0; i < bytes.length; i++) {
      for (var j = 7; j >= 0; j--) bits.push((bytes[i] >> j) & 1);
    }
    return bits;
  }
  function bitsToBytes(bits) {
    var bytes = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
      bytes.push(b);
    }
    return new Uint8Array(bytes);
  }
  /* 熵 -> 助记词：熵位 + SHA-256 前 ENT/32 位校验和，每 11 位取一个词 */
  function mnemonicFromEntropy(entropy) {
    return sha256(entropy).then(function (hash) {
      var entBits = bytesToBits(entropy);
      var csBits = entBits.length / 32;
      var hashBits = bytesToBits(hash);
      var bits = entBits.concat(hashBits.slice(0, csBits));
      var words = [];
      for (var i = 0; i < bits.length; i += 11) {
        var idx = 0;
        for (var j = 0; j < 11; j++) idx = (idx << 1) | bits[i + j];
        words.push(BIP39_WORDS[idx]);
      }
      return words.join(' ');
    });
  }
  /* 校验助记词：词都在表里、词数合规、校验和对得上 */
  function validateMnemonic(mnemonic) {
    var words = mnemonic.trim().split(/\s+/);
    if ([12, 15, 18, 21, 24].indexOf(words.length) === -1) return Promise.resolve(false);
    var bits = [];
    for (var i = 0; i < words.length; i++) {
      var idx = BIP39_WORDS.indexOf(words[i]);
      if (idx === -1) return Promise.resolve(false);
      for (var j = 10; j >= 0; j--) bits.push((idx >> j) & 1);
    }
    var entLen = Math.floor(bits.length * 32 / 33);
    var entropy = bitsToBytes(bits.slice(0, entLen));
    var csBits = bits.slice(entLen);
    return sha256(entropy).then(function (hash) {
      var hashBits = bytesToBits(hash);
      for (var k = 0; k < csBits.length; k++) {
        if (csBits[k] !== hashBits[k]) return false;
      }
      return true;
    });
  }
  /* 词数 -> 熵字节数：12 词 16 字节、15 词 20 字节、18 词 24 字节、21 词 28 字节、24 词 32 字节 */
  function genMnemonic(wordCount) {
    var byteLen = wordCount * 11 * 32 / 33 / 8;
    var entropy = new Uint8Array(byteLen);
    window.crypto.getRandomValues(entropy);
    return mnemonicFromEntropy(entropy);
  }
  function mnemonicBits(wordCount) {
    return wordCount * 11 * 32 / 33;
  }

  /* ---------- 随机数 ---------- */
  function genNumbers(o) {
    var range = o.numMax - o.numMin + 1;
    if (range <= 0) throw new Error('bad range');
    if (range > 4294967296) throw new Error('range too big');
    var out = [];
    for (var i = 0; i < o.numCount; i++) {
      var n = o.numMin + randInt(range);
      var s = String(n);
      if (o.numPad) {
        while (s.length < o.numPadDigits) s = '0' + s;
      }
      out.push(s);
    }
    return out;
  }

  /* ---------- 强度 ---------- */
  function humanTime(seconds) {
    if (seconds < 1) return '不到 1 秒';
    if (seconds < 60) return '约 ' + Math.round(seconds) + ' 秒';
    if (seconds < 3600) return '约 ' + Math.round(seconds / 60) + ' 分钟';
    if (seconds < 86400) return '约 ' + Math.round(seconds / 3600) + ' 小时';
    if (seconds < 31536000) return '约 ' + Math.round(seconds / 86400) + ' 天';
    var years = seconds / 31536000;
    if (years < 10000) return '约 ' + Math.round(years) + ' 年';
    return '超过 1 万年';
  }
  function strengthOf(bits) {
    if (bits < 40) return { label: '弱', color: 'var(--red)' };
    if (bits < 60) return { label: '一般', color: 'var(--amber)' };
    if (bits < 80) return { label: '强', color: 'var(--green)' };
    return { label: '很强', color: 'var(--accent)' };
  }
  function showStrength(bits) {
    var s = strengthOf(bits);
    var fill = $('strengthFill');
    fill.style.width = Math.min(100, Math.round(bits)) + '%';
    fill.style.background = s.color;
    $('strengthLabel').textContent = s.label;
    $('strengthLabel').style.color = s.color;
    $('entropyText').textContent = Math.round(bits) + ' 位熵';
    /* 按每秒 100 亿次猜测估算破解时间（离线暴力破解的量级） */
    $('crackText').textContent = '按每秒 100 亿次猜测，' + humanTime(Math.pow(2, bits) / 1e10) + '可破解';
  }

  /* ---------- 检查我的密码 ---------- */
  /* 最常见的弱密码（RockYou / NCSC 公开榜单前列），只在浏览器里比对，不上传 */
  var COMMON_PASSWORDS = ('123456 123456789 qwerty password 1234567 12345678 12345 111111 123123 1234567890 '
    + 'qwerty123 000000 1qaz2wsx 123321 666666 121212 112233 555555 123qwe 1q2w3e4r admin letmein welcome '
    + 'monkey dragon football iloveyou sunshine master shadow superman michael ashley bailey passw0rd '
    + '1234 123 0000000 123456789a password1 abc123 aaa123 qwertyuiop asdfghjkl zxcvbnm qazwsx qwe123 '
    + '1q2w3e 123456a 987654321 654321 222222 333333 444444 777777 888888 999999 123123123 12345678910 '
    + 'iloveyou1 football1 baseball soccer hockey charlie thomas daniel jessica nicole jasmine chelsea '
    + 'summer winter autumn spring cookie peanut buster hunter jordan tigger robert william richard '
    + 'donald george kenneth steven edward brian ronald anthony kevin jason jeffrey ryan jacob gary '
    + 'nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory frank alexander '
    + 'patrick raymond jack dennis jerry tyler aaron jose adam henry nathan douglas zachary kyle noah '
    + 'ethan jeremy harold keith christian roger noel terry gerald harold sean austin carl arthur lawrence').split(' ');

  function analyzePassword(pw) {
    var hasUpper = /[A-Z]/.test(pw);
    var hasLower = /[a-z]/.test(pw);
    var hasDigit = /[0-9]/.test(pw);
    var hasSymbol = /[^A-Za-z0-9]/.test(pw);
    var classes = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0);
    var pool = (hasUpper ? 26 : 0) + (hasLower ? 26 : 0) + (hasDigit ? 10 : 0) + (hasSymbol ? 32 : 0);
    var bits = pool ? pw.length * (Math.log(pool) / Math.log(2)) : 0;
    var warnings = [];
    if (pw && COMMON_PASSWORDS.indexOf(pw.toLowerCase()) !== -1) {
      warnings.push('这是最常见的密码之一，网上几秒钟就能猜出来');
    }
    if (pw.length > 0 && pw.length < 8) warnings.push('太短了，至少 8 位');
    if (pw.length > 0 && classes === 1) warnings.push('只用了一种字符，大小写字母、数字、符号混着用更难猜');
    if (/^[0-9]+$/.test(pw)) warnings.push('全是数字，换成字母 + 数字 + 符号');
    if (/^(.)\1+$/.test(pw)) warnings.push('同一个字符重复，等于只有 1 位');
    return { bits: bits, classes: classes, warnings: warnings };
  }

  var checkTimer = null;
  function runChecker() {
    var pw = $('checkInput').value;
    var verdict = $('checkVerdict');
    if (!pw) {
      verdict.textContent = '';
      verdict.className = 'pw-check-verdict';
      return;
    }
    var a = analyzePassword(pw);
    var s = strengthOf(a.bits);
    var html = '<span style="color:' + s.color + ';font-weight:700">' + s.label + '</span>'
      + ' · ' + Math.round(a.bits) + ' 位熵 · 按每秒 100 亿次猜测，' + humanTime(Math.pow(2, a.bits) / 1e10) + '可破解';
    if (a.warnings.length) {
      html += '<br><span style="color:var(--red)">' + a.warnings.join('；') + '</span>';
    } else if (a.bits >= 60) {
      html += '<br><span style="color:var(--green)">这个密码不错</span>';
    }
    verdict.innerHTML = html;
    verdict.className = 'pw-check-verdict';
  }

  /* ---------- 查看我的助记词：粘贴已有助记词，按钱包样式排成词卡并校验 ---------- */
  var pasteTimer = null;
  var pastedMnemonic = '';
  function runMnemonicPaste() {
    var raw = $('mnemonicPaste').value;
    var words = raw.toLowerCase().split(/[\s,]+/).filter(function (w) { return w; });
    var grid = $('mnemonicPasteGrid');
    var verdict = $('mnemonicPasteVerdict');
    pastedMnemonic = words.join(' ');
    if (!words.length) {
      grid.hidden = true;
      grid.innerHTML = '';
      verdict.textContent = '';
      verdict.className = 'pw-check-verdict';
      return;
    }
    renderMnemonicGrid(pastedMnemonic, grid);
    grid.hidden = false;
    var bad = [];
    words.forEach(function (w, i) { if (typeof BIP39_WORDS === 'undefined' || BIP39_WORDS.indexOf(w) === -1) bad.push((i + 1) + '（' + w + '）'); });
    if ([12, 15, 18, 21, 24].indexOf(words.length) === -1) {
      verdict.innerHTML = '<span style="color:var(--red)">现在是 ' + words.length + ' 个词，助记词应该是 12 / 15 / 18 / 21 / 24 个词</span>';
      verdict.className = 'pw-check-verdict';
      return;
    }
    if (bad.length) {
      verdict.innerHTML = '<span style="color:var(--red)">第 ' + bad.join('、') + ' 个词不在 BIP39 词表里，可能是拼错了</span>';
      verdict.className = 'pw-check-verdict';
      return;
    }
    var m = pastedMnemonic;
    validateMnemonic(pastedMnemonic).then(function (ok) {
      if (pastedMnemonic !== m) return;
      if (ok) {
        var bits = words.length * 11 * 32 / 33;
        verdict.innerHTML = '<span style="color:var(--green)">校验通过 · ' + words.length + ' 词 · ' + Math.round(bits) + ' 位熵</span>';
      } else {
        verdict.innerHTML = '<span style="color:var(--red)">校验和不通过，可能是抄错了某个词</span>';
      }
      verdict.className = 'pw-check-verdict';
    });
  }

  /* ---------- 生成与渲染 ---------- */
  var currentOutput = '';
  var genSeq = 0;

  /* 助记词按钱包样式显示：带序号的词卡网格（12 词 3 列 x 4 行，24 词 3 列 x 8 行） */
  function renderMnemonicGrid(mnemonic, gridEl) {
    var grid = gridEl || $('mnemonicGrid');
    grid.innerHTML = '';
    mnemonic.split(' ').forEach(function (word, i) {
      var chip = document.createElement('div');
      chip.className = 'pw-mn-chip';
      var num = document.createElement('span');
      num.className = 'pw-mn-index';
      num.textContent = (i + 1);
      var w = document.createElement('span');
      w.className = 'pw-mn-word';
      w.textContent = word;
      chip.appendChild(num);
      chip.appendChild(w);
      grid.appendChild(chip);
    });
  }

  function renderPasswordList(list, o, bits) {
    currentOutput = list[0];
    var isMnemonic = o.mode === 'mnemonic';
    $('pwOutput').hidden = isMnemonic;
    $('mnemonicGrid').hidden = !isMnemonic;
    if (isMnemonic) {
      renderMnemonicGrid(currentOutput);
    } else {
      $('pwOutput').textContent = currentOutput;
    }
    var alts = $('pwAlts');
    alts.innerHTML = '';
    list.slice(1).forEach(function (pw) {
      var btn = document.createElement('button');
      btn.className = 'pw-alt';
      btn.textContent = pw;
      btn.title = '点一下换成这个';
      btn.addEventListener('click', function () {
        currentOutput = pw;
        if (isMnemonic) {
          renderMnemonicGrid(pw);
        } else {
          $('pwOutput').textContent = pw;
        }
        showStrength(bits);
        setStatus('ok', '已换成备选');
      });
      alts.appendChild(btn);
    });
    showStrength(bits);
    setStatus('ok', '已生成');
  }

  function renderNumbers(list, o) {
    currentOutput = list.join(', ');
    $('pwOutput').hidden = false;
    $('mnemonicGrid').hidden = true;
    $('pwOutput').textContent = currentOutput;
    $('pwAlts').innerHTML = '';
    var range = o.numMax - o.numMin + 1;
    var perBits = Math.log(range) / Math.log(2);
    $('numInfo').hidden = false;
    $('numInfo').textContent = '范围 ' + o.numMin + '–' + o.numMax + ' · 每个数约 ' + perBits.toFixed(1) + ' 位熵 · '
      + list.length + ' 个数共约 ' + (perBits * list.length).toFixed(1) + ' 位熵';
    setStatus('ok', '已生成');
  }

  function generate() {
    var seq = ++genSeq;
    var o = currentOptions();
    if (o.mode === 'random' && !o.upper && !o.lower && !o.digits && !o.symbols) {
      $('setLower').checked = true;
      saveOptions();
      showToast('至少要选一种字符，已自动勾上小写字母');
      o = currentOptions();
    }
    if (o.mode === 'number') {
      if (o.numMin > o.numMax) {
        var tmp = o.numMin; o.numMin = o.numMax; o.numMax = tmp;
        $('numMin').value = o.numMin;
        $('numMax').value = o.numMax;
        saveOptions();
        showToast('最小值大于最大值，已自动交换');
      }
      try {
        var nums = genNumbers(o);
        if (seq !== genSeq) return;
        renderNumbers(nums, o);
      } catch (e) {
        if (seq !== genSeq) return;
        setStatus('err', e.message === 'range too big' ? '范围太大（超过 2^32），请缩小' : '这个浏览器不支持安全随机数，无法生成');
        showToast(e.message === 'range too big' ? '范围太大，请缩小' : '这个浏览器不支持安全随机数');
      }
      return;
    }
    if (o.mode === 'mnemonic') {
      var jobs = [];
      try {
        for (var i = 0; i < 5; i++) jobs.push(genMnemonic(o.mnemonicWords));
      } catch (e) {
        setStatus('err', '这个浏览器不支持安全随机数，无法生成');
        showToast('这个浏览器不支持安全随机数');
        return;
      }
      Promise.all(jobs).then(function (list) {
        if (seq !== genSeq) return;
        renderPasswordList(list, o, mnemonicBits(o.mnemonicWords));
      }, function () {
        if (seq !== genSeq) return;
        setStatus('err', '这个浏览器不支持安全随机数，无法生成');
        showToast('这个浏览器不支持安全随机数');
      });
      return;
    }
    try {
      var list = [];
      for (var j = 0; j < 5; j++) list.push(genRandom(o));
      renderPasswordList(list, o, randomBits(o));
    } catch (e) {
      setStatus('err', '这个浏览器不支持安全随机数，无法生成');
      showToast('这个浏览器不支持安全随机数');
    }
  }

  /* 助记词复制成带格式的表格：粘贴到备忘录/Word 这类富文本里仍是带序号的小格子；
     同时保留纯文本，粘贴到钱包还是空格隔开的单词 */
  function buildMnemonicHtml(mnemonic) {
    var words = mnemonic.split(' ');
    var html = '<table style="border-collapse:collapse;font-family:monospace;font-size:14px">';
    for (var r = 0; r < words.length; r += 3) {
      html += '<tr>';
      for (var c = 0; c < 3 && r + c < words.length; c++) {
        html += '<td style="border:1px solid #c8c8c8;padding:8px 12px"><span style="color:#888888">' + (r + c + 1) + '</span>&nbsp;&nbsp;<b>' + words[r + c] + '</b></td>';
      }
      html += '</tr>';
    }
    return html + '</table>';
  }
  function fallbackCopyHtml(html, text, done) {
    var div = document.createElement('div');
    div.contentEditable = 'true';
    div.innerHTML = html;
    div.style.position = 'fixed';
    div.style.opacity = '0';
    document.body.appendChild(div);
    var range = document.createRange();
    range.selectNodeContents(div);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    sel.removeAllRanges();
    document.body.removeChild(div);
    done(ok);
  }
  function copyMnemonic(text, done) {
    var html = buildMnemonicHtml(text);
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      var item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      });
      navigator.clipboard.write([item]).then(function () { done(true); }, function () { fallbackCopyHtml(html, text, done); });
    } else {
      fallbackCopyHtml(html, text, done);
    }
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }
  function copyOutput() {
    if (!currentOutput) { showToast('先生成一个'); return; }
    var what = $('modeSelect').value === 'mnemonic' ? '助记词' : $('modeSelect').value === 'number' ? '数字' : '密码';
    function done(ok) {
      if (ok) { showToast('已复制' + what); setStatus('ok', '已复制' + what); }
      else { showToast('复制失败，请手动选中复制'); setStatus('warn', '复制失败，请手动选中复制'); }
    }
    if ($('modeSelect').value === 'mnemonic') { copyMnemonic(currentOutput, done); return; }
    copyText(currentOutput, done);
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done(ok);
  }

  /* ---------- 控件联动 ---------- */
  function syncLength() {
    var v = Math.min(64, Math.max(8, parseInt($('lengthNum').value, 10) || 16));
    $('lengthRange').value = v;
    $('lengthNum').value = v;
    $('lengthValue').textContent = v;
  }
  function updateModeUI() {
    var mode = $('modeSelect').value;
    $('lengthRow').hidden = mode !== 'random';
    $('charsetRow').hidden = mode !== 'random';
    $('ambRow').hidden = mode !== 'random';
    $('mnemonicRow').hidden = mode !== 'mnemonic';
    $('mnemonicNote').hidden = mode !== 'mnemonic';
    $('numberRow').hidden = mode !== 'number';
    $('pinRow').hidden = mode !== 'number';
    $('strengthBlock').style.display = mode === 'number' ? 'none' : '';
    $('altsWrap').style.display = mode === 'number' ? 'none' : '';
    $('numInfo').hidden = mode !== 'number';
    $('pwOutput').hidden = mode === 'mnemonic';
    $('mnemonicGrid').hidden = mode !== 'mnemonic';
    $('btnCopy').textContent = mode === 'mnemonic' ? '复制助记词' : mode === 'number' ? '复制全部数字' : '复制密码';
    $('pwOutput').title = mode === 'number' ? '点一下复制全部数字' : '点一下复制密码';
  }

  $('modeSelect').addEventListener('change', function () { updateModeUI(); saveOptions(); generate(); });
  $('lengthRange').addEventListener('input', function () { $('lengthNum').value = this.value; $('lengthValue').textContent = this.value; saveOptions(); generate(); });
  $('lengthNum').addEventListener('change', function () { syncLength(); saveOptions(); generate(); });
  ['setUpper', 'setLower', 'setDigits', 'setSymbols', 'excludeAmbiguous'].forEach(function (id) {
    $(id).addEventListener('change', function () { saveOptions(); generate(); });
  });
  $('mnemonicWords').addEventListener('change', function () { saveOptions(); generate(); });
  ['numMin', 'numMax', 'numCount', 'numPadDigits'].forEach(function (id) {
    $(id).addEventListener('change', function () { saveOptions(); generate(); });
  });
  $('numPad').addEventListener('change', function () {
    $('numPadDigits').disabled = !this.checked;
    saveOptions(); generate();
  });
  $('btnPin4').addEventListener('click', function () { setPin(4); });
  $('btnPin6').addEventListener('click', function () { setPin(6); });
  function setPin(digits) {
    $('numMin').value = 0;
    $('numMax').value = digits === 4 ? 9999 : 999999;
    $('numPad').checked = true;
    $('numPadDigits').value = digits;
    $('numPadDigits').disabled = false;
    saveOptions();
    generate();
    showToast('已设为 ' + digits + ' 位 PIN');
  }

  $('btnGenerate').addEventListener('click', generate);
  $('btnCopy').addEventListener('click', copyOutput);
  $('pwOutput').addEventListener('click', copyOutput);
  $('mnemonicGrid').addEventListener('click', copyOutput);
  $('mnemonicPaste').addEventListener('input', function () {
    if (pasteTimer) clearTimeout(pasteTimer);
    pasteTimer = setTimeout(runMnemonicPaste, 200);
  });
  $('mnemonicPasteGrid').addEventListener('click', function () {
    if (!pastedMnemonic) return;
    copyMnemonic(pastedMnemonic, function (ok) {
      if (ok) { showToast('已复制助记词'); setStatus('ok', '已复制助记词'); }
      else { showToast('复制失败，请手动选中复制'); setStatus('warn', '复制失败，请手动选中复制'); }
    });
  });

  /* 检查我的密码：输入即算（200ms 防抖），只在浏览器里算 */
  $('checkInput').addEventListener('input', function () {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(runChecker, 200);
  });
  $('btnCheckToggle').addEventListener('click', function () {
    var input = $('checkInput');
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    this.textContent = show ? '隐藏' : '显示';
  });

  /* ---------- 测试钩子 ---------- */
  window.__pw = {
    mnemonicFromEntropy: mnemonicFromEntropy,
    validateMnemonic: validateMnemonic,
    analyzePassword: analyzePassword,
    buildMnemonicHtml: buildMnemonicHtml,
    bip39WordCount: (typeof BIP39_WORDS !== 'undefined') ? BIP39_WORDS.length : 0,
    bip39HasWord: function (w) { return (typeof BIP39_WORDS !== 'undefined') && BIP39_WORDS.indexOf(w) !== -1; }
  };

  /* ---------- 初始化 ---------- */
  var theme = 'dark';
  try { theme = localStorage.getItem('json-wb-theme') || 'dark'; } catch (e) {}
  applyTheme(theme);
  restoreOptions();
  $('numPadDigits').disabled = !$('numPad').checked;
  updateModeUI();
  generate();
})();
