/* 密码生成器：随机强密码与词组密码。
   纯静态零后端；用浏览器内置的安全随机数（crypto.getRandomValues）本地生成。
   生成的密码不会保存到任何地方，刷新页面就消失；只记选项（模式、长度、字符集）。 */
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

  /* ---------- 词组密码词表（常见英文单词，小写） ---------- */
  var WORDS = ('apple banana orange grape lemon peach melon berry cherry mango kiwi plum pear fig date '
    + 'tiger lion bear wolf fox deer horse eagle shark whale snake monkey panda koala zebra camel donkey goat sheep pig cow dog cat bird fish frog duck goose hen owl crow hawk mole crab shrimp snail ant bee fly worm moth bat rat mouse rabbit turtle lizard '
    + 'red blue green yellow purple orange pink brown black white gray silver gold copper iron stone rock sand beach ocean river lake pond stream cloud rain snow wind storm thunder sun moon star sky rain cloud fog mist ice fire flame smoke ash dust mud clay sand wave tide shore cliff hill mountain valley forest jungle desert island coast harbor bridge road street tower castle palace temple garden park field farm barn mill shop market school hospital hotel office house home room door window wall floor roof stair table chair bed lamp clock book page pen paper box bag cup plate bowl spoon fork knife key lock bell drum guitar piano violin flute horn bell rope chain nail hammer saw drill screw bolt wire cable plug switch bulb fan stove oven fridge sink bath soap towel shirt pants shoes hat coat scarf glove sock ring watch coin stamp card dice ball game toy kite doll robot train plane boat ship car bus bike wheel sail anchor flag crown sword shield helmet armor arrow bow spear knife spoon fork plate cup bowl pot pan grill knife '
    + 'happy lucky brave clever quick swift strong smart kind warm cool fresh clean clear bright dark deep high low fast slow soft hard sharp smooth rough round square tall short big small long wide thick thin heavy light easy hard new old young free rich poor good bad true false right wrong first last next past future early late young old rich poor kind mean nice rude glad sad mad glad calm busy free safe sure true real main only own same next last past new old big small long short high low deep wide thick thin heavy light easy hard soft rough smooth sharp clear bright dark warm cool fresh clean quick slow fast strong weak brave smart kind nice glad calm busy free safe sure true real main only own same '
    + 'run jump walk swim fly drive ride climb jump sing dance read write draw paint cook eat drink sleep wake dream think learn teach speak listen watch wait work play laugh cry smile shout whisper shout call ask tell give take make find keep lose buy sell pay cost open close push pull lift drop hold catch throw kick hit cut wash clean cook bake boil fry mix stir pour fill empty break fix build grow plant water feed wash dress wear use try win lose love hate hope wish want need like love help save keep give take bring carry send meet visit travel visit stay leave come go back turn move stop start begin end finish open close rise fall grow shrink expand spread cover hide seek find lose win play work rest sleep wake eat drink cook clean wash read write draw sing dance jump run walk swim fly drive ride climb sit stand lie fall rise grow bloom fade shine glow burn melt freeze boil steam smoke rain snow blow shake tremble slide slip spin roll twist bend fold tie knot lock unlock open shut push pull drag carry lift drop throw catch kick hit beat cut chop slice peel grate mash stir mix bake fry boil steam roast grill toast freeze chill heat cool warm dry wet soak rinse scrub polish paint draw sketch color shade trace print stamp sign seal post mail ship pack wrap tape glue nail screw drill saw hammer wrench pliers ladder rope chain hook nail pin needle thread button zip pocket sleeve collar cuff heel sole lace buckle strap belt purse wallet coin bill check price cost sale shop buy sell trade swap lend borrow owe pay earn save spend waste count add plus minus times divide equal total sum half double triple quarter percent rate ratio score point goal win tie loss match game team ball bat glove puck stick net goal hoop court field track lane race speed time clock watch date day week month year hour minute second morning night noon dawn dusk spring summer autumn winter season weather climate storm cloud rain snow wind fog ice frost dew mist smoke fire flame heat light dark shadow beam ray glow spark flash blaze ember ash coal wood log leaf root stem branch trunk bark petal thorn seed nut grain rice wheat corn oat barley bean pea corn potato tomato onion garlic pepper salt sugar honey milk cheese butter bread cake pie soup salad juice tea coffee beer wine milk water ice juice soda pop candy sweet sour bitter spicy salty tasty yummy hungry thirsty full empty clean dirty neat tidy messy rough smooth soft hard sharp blunt round flat straight bent curly wavy thin thick wide narrow tall short big small long low high deep shallow full empty open shut loud quiet soft hard fast slow quick swift rapid sudden gradual steady stable firm solid liquid gas vapor solid fluid sticky silky woolly furry scaly slimy prickly thorny hairy bald smooth rough coarse fine soft tender tough strong weak hard easy simple complex plain fancy modern ancient classic retro vintage new old young aged fresh stale rotten ripe raw cooked baked fried boiled frozen fresh raw ripe sweet sour bitter salty spicy mild hot cold warm cool chilly freezing boiling steaming sizzling sparkling glowing shining bright dim dark pale vivid dull clear foggy misty hazy sunny cloudy rainy snowy windy stormy calm quiet noisy loud silent still moving shaking spinning rolling sliding falling rising floating sinking swimming flying driving riding walking running jumping climbing crawling creeping sneaking hiding seeking finding losing winning playing working resting sleeping waking dreaming thinking learning teaching speaking listening watching waiting hoping wishing wanting needing liking loving hating helping saving keeping giving taking bringing carrying sending meeting visiting traveling staying leaving coming going turning moving stopping starting beginning ending finishing opening closing rising falling growing shrinking expanding spreading covering hiding seeking finding losing winning').split(' ');
  WORDS = WORDS.filter(function (w, i) { return w && WORDS.indexOf(w) === i; });

  /* ---------- 安全随机数（拒绝采样，避免取模偏差） ---------- */
  function randInt(n) {
    if (!window.crypto || !window.crypto.getRandomValues) {
      throw new Error('no crypto');
    }
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
      words: Math.min(6, Math.max(3, parseInt($('wordsNum').value, 10) || 4)),
      separator: $('sepSelect').value,
      capitalize: $('capitalize').checked
    };
  }

  /* 选项存在本机（只记选项，不记密码） */
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
      if (o.words) { $('wordsRange').value = o.words; $('wordsNum').value = o.words; $('wordsValue').textContent = o.words; }
      if (o.separator) $('sepSelect').value = o.separator;
      if (typeof o.capitalize === 'boolean') $('capitalize').checked = o.capitalize;
    } catch (e) {}
  }

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

  function genPassphrase(o) {
    var parts = [];
    for (var i = 0; i < o.words; i++) {
      var w = WORDS[randInt(WORDS.length)];
      if (o.capitalize) w = w.charAt(0).toUpperCase() + w.slice(1);
      parts.push(w);
    }
    return parts.join(o.separator);
  }

  function entropyBits(o) {
    if (o.mode === 'passphrase') {
      var perWord = Math.log(WORDS.length) / Math.log(2) + (o.capitalize ? 1 : 0);
      return o.words * perWord;
    }
    var pool = buildPool(o);
    if (!pool) return 0;
    return o.length * (Math.log(pool.length) / Math.log(2));
  }

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

  var currentPassword = '';
  function showStrength(o) {
    var bits = entropyBits(o);
    var label, color, width;
    if (bits < 40) { label = '弱'; color = 'var(--red)'; }
    else if (bits < 60) { label = '一般'; color = 'var(--amber)'; }
    else if (bits < 80) { label = '强'; color = 'var(--green)'; }
    else { label = '很强'; color = 'var(--accent)'; }
    width = Math.min(100, Math.round(bits / 100 * 100));
    var fill = $('strengthFill');
    fill.style.width = width + '%';
    fill.style.background = color;
    $('strengthLabel').textContent = label;
    $('strengthLabel').style.color = color;
    $('entropyText').textContent = Math.round(bits) + ' 位熵';
    /* 按每秒 100 亿次猜测估算破解时间（离线暴力破解的量级） */
    $('crackText').textContent = '按每秒 100 亿次猜测，' + humanTime(Math.pow(2, bits) / 1e10) + '可破解';
  }

  function generate() {
    var o = currentOptions();
    if (o.mode === 'random' && !o.upper && !o.lower && !o.digits && !o.symbols) {
      $('setLower').checked = true;
      saveOptions();
      showToast('至少要选一种字符，已自动勾上小写字母');
      o = currentOptions();
    }
    var list = [];
    try {
      for (var i = 0; i < 5; i++) {
        list.push(o.mode === 'passphrase' ? genPassphrase(o) : genRandom(o));
      }
    } catch (e) {
      setStatus('err', '这个浏览器不支持安全随机数，无法生成');
      showToast('这个浏览器不支持安全随机数');
      return;
    }
    currentPassword = list[0];
    $('pwOutput').textContent = currentPassword;
    var alts = $('pwAlts');
    alts.innerHTML = '';
    list.slice(1).forEach(function (pw) {
      var btn = document.createElement('button');
      btn.className = 'pw-alt';
      btn.textContent = pw;
      btn.title = '点一下换成这个';
      btn.addEventListener('click', function () {
        currentPassword = pw;
        $('pwOutput').textContent = pw;
        showStrength(currentOptions());
        setStatus('ok', '已换成备选密码');
      });
      alts.appendChild(btn);
    });
    showStrength(o);
    setStatus('ok', '已生成');
  }

  function copyPassword() {
    if (!currentPassword) { showToast('先生成一个密码'); return; }
    function done(ok) {
      if (ok) { showToast('已复制密码'); setStatus('ok', '已复制密码'); }
      else { showToast('复制失败，请手动选中复制'); setStatus('warn', '复制失败，请手动选中复制'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentPassword).then(function () { done(true); }, function () { fallbackCopy(done); });
    } else {
      fallbackCopy(done);
    }
  }
  function fallbackCopy(done) {
    var ta = document.createElement('textarea');
    ta.value = currentPassword;
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
  function syncWords() {
    var v = Math.min(6, Math.max(3, parseInt($('wordsNum').value, 10) || 4));
    $('wordsRange').value = v;
    $('wordsNum').value = v;
    $('wordsValue').textContent = v;
  }
  function updateModeUI() {
    var isPass = $('modeSelect').value === 'passphrase';
    $('lengthRow').hidden = isPass;
    $('charsetRow').hidden = isPass;
    $('ambRow').hidden = isPass;
    $('wordsRow').hidden = !isPass;
    $('sepRow').hidden = !isPass;
  }

  $('modeSelect').addEventListener('change', function () { updateModeUI(); saveOptions(); generate(); });
  $('lengthRange').addEventListener('input', function () { $('lengthNum').value = this.value; $('lengthValue').textContent = this.value; saveOptions(); generate(); });
  $('lengthNum').addEventListener('change', function () { syncLength(); saveOptions(); generate(); });
  $('wordsRange').addEventListener('input', function () { $('wordsNum').value = this.value; $('wordsValue').textContent = this.value; saveOptions(); generate(); });
  $('wordsNum').addEventListener('change', function () { syncWords(); saveOptions(); generate(); });
  ['setUpper', 'setLower', 'setDigits', 'setSymbols', 'excludeAmbiguous'].forEach(function (id) {
    $(id).addEventListener('change', function () { saveOptions(); generate(); });
  });
  $('sepSelect').addEventListener('change', function () { saveOptions(); generate(); });
  $('capitalize').addEventListener('change', function () { saveOptions(); generate(); });

  $('btnGenerate').addEventListener('click', generate);
  $('btnCopy').addEventListener('click', copyPassword);
  $('pwOutput').addEventListener('click', copyPassword);

  /* ---------- 初始化 ---------- */
  var theme = 'dark';
  try { theme = localStorage.getItem('json-wb-theme') || 'dark'; } catch (e) {}
  applyTheme(theme);
  restoreOptions();
  updateModeUI();
  generate();
})();
