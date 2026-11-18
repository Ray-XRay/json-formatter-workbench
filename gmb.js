/* 到站看板：巴士 · 小巴 / 港鐵實時到站。
   數據全部來自政府公開接口、無需 key、瀏覽器直接請求（CORS: *）：
   - 巴士 · 小巴（合併模式）：輸路線號碼後同時查五個來源——專線小巴 data.etagmb.gov.hk（新界 / 九龍 / 港島）、
     九巴 data.etabus.gov.hk、城巴 rt.data.gov.hk/v2；同一個編號有多條路線時全部列出、點一下自由切換（選方向 -> 選站 -> 看分鐘數）
   - 港鐵：rt.data.gov.hk/v1/transport/mtr/getSchedule.php（ttnt 欄位就是分鐘數） */
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

  /* ---------- 主題（與其它頁共用 json-wb-theme） ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var sel = $('themeSelect');
    if (sel) sel.value = theme;
    try { localStorage.setItem('json-wb-theme', theme); } catch (e) {}
  }
  $('themeSelect').addEventListener('change', function () { applyTheme(this.value); });

  /* 頂欄品牌切換：點左上角品牌塊打開工具下拉 */
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
  /* 乾淨地址（/qr 等）：已在當前工具時不跳轉；本地 file:// 直接打開時補回 .html */
  function goToTool(page) {
    var cur = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '');
    if (cur === '') cur = '/';
    if (page === cur) return;
    var target = page;
    if (location.protocol === 'file:') {
      target = page === '/' ? 'index.html' : page.slice(1) + '.html';
    }
    // 工具間跳轉：給新頁面留個標記，讓它播一次進入動畫（冷打開不播）；
    // 跨頁過渡本身交給 View Transitions（支援的瀏覽器）或新頁淡入（不支援的），這裡不延遲、立即跳
    try { sessionStorage.setItem('json-wb-nav', '1'); } catch (e) {}
    location.href = target;
  }
  brandMenu.addEventListener('click', function (e) {
    var item = e.target.closest('.brand-item');
    if (!item) return;
    var page = item.getAttribute('data-page');
    closeBrand();
    if (page) goToTool(page);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeBrand();
  });

  /* ---------- API ---------- */
  var GMB_API = 'https://data.etagmb.gov.hk';
  var KMB_API = 'https://data.etabus.gov.hk/v1/transport/kmb';
  var CTB_API = 'https://rt.data.gov.hk/v2/transport/citybus';
  var MTR_API = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';
  var REGIONS = ['NT', 'KLN', 'HKI'];
  // 候選路線來源：gmb-NT / gmb-KLN / gmb-HKI / kmb / ctb
  var SRC_LABEL = { 'gmb-NT': '專線小巴 · 新界', 'gmb-KLN': '專線小巴 · 九龍', 'gmb-HKI': '專線小巴 · 港島', kmb: '九巴', ctb: '城巴' };
  var SRC_SHORT = { 'gmb-NT': '小巴·新界', 'gmb-KLN': '小巴·九龍', 'gmb-HKI': '小巴·港島', kmb: '九巴', ctb: '城巴' };

  var state = {
    mode: 'road', loading: false, etaTimer: null,
    roadKind: '', roadSrc: '', roadCode: '', candidates: [],
    // 小巴
    routeCode: '', region: '', routeId: 0, directions: [], routeSeq: 0,
    stops: [], stopSeq: 0, stopName: '',
    // 巴士
    bus: { op: '', code: '', dirs: [], dirKey: '', serviceType: '1', stops: [], stopSeq: 0, stopId: '' },
    // 港鐵
    mtr: { line: 'TWL', sta: 'KWF', dir: 'UP' }
  };

  function fetchJson(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 10000);
    return fetch(url, { signal: ctrl.signal }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }
  function fmtNow() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }
  function minsFrom(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return null;
    return Math.max(0, Math.round((t - Date.now()) / 60000));
  }

  /* ---------- 最近路線：只存本機，記住路線號碼 + 來源（九巴 / 城巴 / 小巴地區），點一下直達同一條 ---------- */
  function getRecent() {
    var out = [], seen = {};
    // 舊版分開存的兩條 key（純字串）也合併進來，沿用
    ['gmb-wb-recent', 'gmb-wb-recent-bus'].forEach(function (key) {
      try {
        var v = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(v)) return;
        v.forEach(function (x) {
          var e = typeof x === 'string'
            ? { code: x, src: '' }
            : (x && typeof x.code === 'string' ? { code: x.code, src: x.src || '' } : null);
          if (!e) return;
          var k = e.code + '|' + e.src;
          if (seen[k]) return;
          seen[k] = 1;
          out.push(e);
        });
      } catch (e) {}
    });
    return out.slice(0, 5);
  }
  function saveRecent(code, src) {
    try {
      var list = getRecent().filter(function (x) { return !(x.code === code && x.src === (src || '')); });
      list.unshift({ code: code, src: src || '' });
      localStorage.setItem('gmb-wb-recent', JSON.stringify(list.slice(0, 5)));
    } catch (e) {}
    renderRecent();
  }
  function renderRecent() {
    var box = $('recentChips');
    box.innerHTML = '';
    var list = getRecent();
    if (!list.length) return;
    var label = document.createElement('span');
    label.className = 'hint';
    label.textContent = '最近：';
    box.appendChild(label);
    list.forEach(function (e) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = e.code + (e.src && SRC_SHORT[e.src] ? ' · ' + SRC_SHORT[e.src] : '');
      b.addEventListener('click', function () {
        $('routeInput').value = e.code;
        if (e.src) roadLoadBySrc(e.code, e.src); else roadSearch(e.code, {});
      });
      box.appendChild(b);
    });
  }

  /* ---------- 共用：方向按鈕 / 站列表 / ETA 卡 ---------- */
  function renderDirButtons(items, activeKey, onPick) {
    var box = $('dirBtns');
    box.innerHTML = '';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'seg-btn' + (String(it.key) === String(activeKey) ? ' active' : '');
      b.type = 'button';
      b.textContent = it.label;
      b.addEventListener('click', function () {
        box.querySelectorAll('.seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        onPick(it.key);
      });
      box.appendChild(b);
    });
  }

  function renderStops(list, activeSeq, onPick) {
    var sel = $('stopSelect');
    sel.innerHTML = '';
    list.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.stop_seq;
      opt.textContent = s.stop_seq + '. ' + s.name_tc;
      if (s.stop_seq === activeSeq) opt.selected = true;
      sel.appendChild(opt);
    });
    $('stopCount').textContent = list.length || '—';
    var box = $('stopList');
    var q = ($('stopFilter').value || '').trim().toLowerCase();
    box.innerHTML = '';
    var shown = list.filter(function (s) {
      return !q || s.name_tc.indexOf(q) !== -1 || (s.name_en || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!shown.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '沒有符合的站';
      box.appendChild(empty);
      return;
    }
    shown.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'stop-item' + (s.stop_seq === activeSeq ? ' active' : '');
      b.type = 'button';
      var num = document.createElement('span');
      num.className = 'stop-num';
      num.textContent = s.stop_seq;
      var name = document.createElement('span');
      name.className = 'stop-name';
      name.textContent = s.name_tc;
      b.appendChild(num);
      b.appendChild(name);
      b.addEventListener('click', function () { onPick(s.stop_seq); });
      box.appendChild(b);
    });
  }

  // items: [{min, time, remark}]，time 已是 HH:MM
  function renderEtaCards(items) {
    for (var i = 0; i < 3; i++) {
      var card = $('eta' + i);
      var minEl = card.querySelector('.eta-min');
      var timeEl = card.querySelector('.eta-time');
      var remarkEl = card.querySelector('.eta-remark');
      var item = items && items[i];
      if (!item) {
        minEl.textContent = '—';
        timeEl.textContent = '暫無班次';
        remarkEl.textContent = '';
        card.classList.remove('soon');
        continue;
      }
      var diff = item.min;
      minEl.textContent = diff <= 0 ? '即到' : String(diff);
      if (diff > 0) {
        var unit = document.createElement('span');
        unit.className = 'eta-unit';
        unit.textContent = '分鐘';
        minEl.appendChild(unit);
      }
      timeEl.textContent = (item.time || '—') + ' 到站';
      remarkEl.textContent = item.remark || '';
      card.classList.toggle('soon', diff <= 0);
    }
  }

  function stampUpdated() {
    var stamp = fmtNow();
    $('routeUpdated').textContent = '更新於 ' + stamp;
    $('detailStats').textContent = '每分鐘更新 · ' + stamp;
    setStatus('ok', '已更新 ' + stamp);
  }

  /* ---------- 模式切換：road（巴士 · 小巴合併）/ mtr ---------- */
  function setMode(mode, opts) {
    opts = opts || {};
    state.mode = mode;
    document.querySelectorAll('#modeTabs .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });
    $('busRow').hidden = mode === 'mtr';
    $('mtrRow').hidden = mode !== 'mtr';
    $('stopLabel').hidden = mode === 'mtr';
    $('allStops').hidden = mode === 'mtr';
    $('recentChips').hidden = mode === 'mtr';
    $('routeCandidates').hidden = mode === 'mtr' || state.candidates.length <= 1;
    $('routeInput').placeholder = mode === 'mtr' ? '' : '例如 87M、1、101、968';
    $('routeCode').textContent = mode === 'mtr' ? '港鐵' : (state.roadCode || '巴士 · 小巴');
    if (mode === 'mtr') {
      renderMtrLines();
      mtrRenderStations(opts.sta);
      mtrLoadEta();
    } else if (state.roadKind === 'bus') {
      $('routeRegion').textContent = state.bus.op === 'KMB' ? '九巴' : '城巴';
      renderBusDirections(); renderStops(state.bus.stops, state.bus.stopSeq, busSetStop); busLoadEta();
    } else if (state.roadKind === 'gmb') {
      $('routeRegion').textContent = SRC_LABEL['gmb-' + state.region] || state.region;
      renderGmbDirections(); renderStops(state.stops, state.stopSeq, setStop); loadEta();
    } else {
      // 還沒查過路線：預設就是 87M 四號碼頭出發（方向 2、站 1）
      roadSearch('87M', { dir: 2, stop: 1 });
    }
    renderRecent();
  }

  /* ================= 巴士 · 小巴（合併）：同時查五個來源，同編號多條路線任選 ================= */
  // 候選路線：{ src, code, label, summary, payload }
  function roadSearch(code, opts) {
    code = (code || '').trim().toUpperCase();
    if (!code) { setStatus('warn', '請先輸入路線號碼'); return Promise.resolve(false); }
    if (state.loading) return Promise.resolve(false);
    state.loading = true;
    setStatus('idle', '正在找 ' + code + '…');
    $('routeInput').value = code;
    state.candidates = [];
    var box = $('routeCandidates');
    box.hidden = true;
    box.innerHTML = '';
    var probes = [];
    // 專線小巴：新界 / 九龍 / 港島三個地區並行查
    REGIONS.forEach(function (region) {
      probes.push(fetchJson(GMB_API + '/route/' + region + '/' + encodeURIComponent(code))
        .then(function (json) {
          if (json && Array.isArray(json.data) && json.data.length) {
            var r = json.data[0];
            var d0 = (r.directions && r.directions[0]) || {};
            return { src: 'gmb-' + region, code: code, label: SRC_LABEL['gmb-' + region],
              summary: (d0.orig_tc || '') + ' ↔ ' + (d0.dest_tc || ''),
              payload: { region: region, route: r } };
          }
          return null;
        }).catch(function () { return null; }));
    });
    // 九巴、城巴並行查
    probes.push(tryKmb(code).then(function (f) {
      return f ? { src: 'kmb', code: code, label: '九巴', summary: f.dirs[0].label, payload: f } : null;
    }).catch(function () { return null; }));
    probes.push(tryCtb(code).then(function (f) {
      return f ? { src: 'ctb', code: code, label: '城巴', summary: f.dirs[0].label, payload: f } : null;
    }).catch(function () { return null; }));
    return Promise.all(probes).then(function (found) {
      state.loading = false;
      var cands = found.filter(Boolean);
      state.candidates = cands;
      if (!cands.length) {
        setStatus('err', '找不到路線 ' + code);
        showToast('找不到 ' + code + '，檢查一下號碼');
        return false;
      }
      var pick = null;
      if (opts && opts.src) {
        cands.forEach(function (c) { if (c.src === opts.src) pick = c; });
      }
      // 只有一條就直接載入；多條就列出來等用戶自己選
      if (cands.length === 1) pick = cands[0];
      renderCandidates();
      if (pick) return roadLoadCandidate(pick, opts);
      setStatus('idle', '找到 ' + cands.length + ' 條同編號路線，請選一條');
      return true;
    }).catch(function (err) {
      state.loading = false;
      setStatus('err', '查不到，請檢查網絡後再試');
      showToast('請求失敗：' + (err && err.message ? err.message : '網絡錯誤'));
      return false;
    });
  }

  function renderCandidates() {
    var box = $('routeCandidates');
    box.innerHTML = '';
    var cands = state.candidates;
    if (cands.length <= 1) { box.hidden = true; return; }
    box.hidden = false;
    var label = document.createElement('div');
    label.className = 'hint';
    label.textContent = '同一個編號有多條路線，請選一條：';
    box.appendChild(label);
    cands.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'gmb-cand' + (state.roadSrc === c.src && state.roadCode === c.code ? ' active' : '');
      b.type = 'button';
      var main = document.createElement('span');
      main.className = 'gmb-cand-main';
      main.textContent = c.label + ' ' + c.code;
      var sub = document.createElement('span');
      sub.className = 'gmb-cand-sub';
      sub.textContent = c.summary;
      b.appendChild(main);
      b.appendChild(sub);
      b.addEventListener('click', function () { roadLoadCandidate(c, {}); });
      box.appendChild(b);
    });
  }

  function roadLoadCandidate(cand, opts) {
    opts = opts || {};
    state.roadSrc = cand.src;
    state.roadCode = cand.code;
    if (cand.src.indexOf('gmb-') === 0) {
      state.roadKind = 'gmb';
      applyGmbRoute(cand.code, cand.payload.region, cand.payload.route, opts);
    } else {
      state.roadKind = 'bus';
      applyBusRoute(cand.code, cand.payload, opts);
    }
    renderCandidates();
    return Promise.resolve(true);
  }

  // 最近路線點回來：只查當時那個來源，查不到才退回全來源搜尋
  function roadLoadBySrc(code, src) {
    if (state.loading) return Promise.resolve(false);
    setStatus('idle', '正在找 ' + code + '…');
    var probe;
    if (src.indexOf('gmb-') === 0) {
      var region = src.slice(4);
      probe = fetchJson(GMB_API + '/route/' + region + '/' + encodeURIComponent(code)).then(function (json) {
        if (json && Array.isArray(json.data) && json.data.length) {
          var r = json.data[0];
          var d0 = (r.directions && r.directions[0]) || {};
          return { src: src, code: code, label: SRC_LABEL[src],
            summary: (d0.orig_tc || '') + ' ↔ ' + (d0.dest_tc || ''),
            payload: { region: region, route: r } };
        }
        return null;
      }).catch(function () { return null; });
    } else if (src === 'kmb') {
      probe = tryKmb(code).then(function (f) {
        return f ? { src: 'kmb', code: code, label: '九巴', summary: f.dirs[0].label, payload: f } : null;
      });
    } else if (src === 'ctb') {
      probe = tryCtb(code).then(function (f) {
        return f ? { src: 'ctb', code: code, label: '城巴', summary: f.dirs[0].label, payload: f } : null;
      });
    } else {
      return roadSearch(code, {});
    }
    return probe.then(function (cand) {
      if (cand) {
        state.candidates = [cand];
        return roadLoadCandidate(cand, {});
      }
      return roadSearch(code, {});
    });
  }

  function applyGmbRoute(code, region, route, opts) {
    opts = opts || {};
    state.routeCode = code;
    state.region = region;
    state.routeId = route.route_id;
    state.directions = route.directions || [];
    saveRecent(code, 'gmb-' + region);
    $('routeCode').textContent = code;
    $('routeRegion').textContent = SRC_LABEL['gmb-' + region] || region;
    renderGmbDirections(opts.dir);
  }

  function renderGmbDirections(preferSeq) {
    var seq = preferSeq;
    if (!seq || !state.directions.some(function (d) { return d.route_seq === seq; })) {
      seq = state.directions.length ? state.directions[0].route_seq : 0;
    }
    renderDirButtons(state.directions.map(function (d) {
      return { key: d.route_seq, label: d.orig_tc + ' → ' + d.dest_tc };
    }), seq, function (k) { setDirection(Number(k)); });
    setDirection(seq);
  }

  function setDirection(seq) {
    if (!seq) return;
    state.routeSeq = seq;
    var btns = $('dirBtns').querySelectorAll('.seg-btn');
    state.directions.forEach(function (d, i) {
      if (btns[i]) btns[i].classList.toggle('active', d.route_seq === seq);
    });
    loadStops();
  }

  function loadStops(preferStop) {
    if (!state.routeId || !state.routeSeq) return Promise.resolve();
    setStatus('idle', '正在載入站點…');
    return fetchJson(GMB_API + '/route-stop/' + state.routeId + '/' + state.routeSeq)
      .then(function (json) {
        state.stops = (json && json.data && json.data.route_stops) || [];
        var stop = preferStop;
        if (!stop || !state.stops.some(function (s) { return s.stop_seq === stop; })) {
          stop = state.stops.length ? state.stops[0].stop_seq : 0;
        }
        setStop(stop);
      })
      .catch(function () {
        setStatus('err', '站點載入失敗，請再試一次');
      });
  }

  function setStop(seq) {
    if (!seq) return;
    state.stopSeq = seq;
    var stop = null;
    state.stops.forEach(function (s) { if (s.stop_seq === seq) stop = s; });
    state.stopName = stop ? stop.name_tc : '';
    renderStops(state.stops, seq, setStop);
    loadEta();
  }

  function loadEta() {
    if (!state.routeId || !state.routeSeq || !state.stopSeq) return Promise.resolve();
    setStatus('idle', '正在查到站時間…');
    return fetchJson(GMB_API + '/eta/route-stop/' + state.routeId + '/' + state.routeSeq + '/' + state.stopSeq)
      .then(function (json) {
        var data = (json && json.data) || {};
        if (!data.enabled) {
          renderEtaCards([]);
          setStatus('warn', '這站暫無實時到站資料');
          $('detailStats').textContent = '';
          return;
        }
        renderEtaCards((data.eta || []).map(function (e) {
          return { min: e.diff, time: fmtTime(e.timestamp), remark: e.remarks_tc || '' };
        }));
        stampUpdated();
      })
      .catch(function () {
        setStatus('err', '到站時間查不到，請再試一次');
      });
  }

  /* ================= 巴士：九巴 / 城巴 ================= */
  function applyBusRoute(code, found, opts) {
    opts = opts || {};
    state.bus = { op: found.op, code: code, dirs: found.dirs, dirKey: '', serviceType: found.serviceType || '1', stops: [], stopSeq: 0, stopId: '' };
    saveRecent(code, found.op === 'KMB' ? 'kmb' : 'ctb');
    $('routeCode').textContent = code;
    $('routeRegion').textContent = found.op === 'KMB' ? '九巴' : '城巴';
    renderBusDirections(opts.dir);
  }

  function tryKmb(code) {
    var dirs = [];
    var chain = Promise.resolve();
    [['outbound', 'O'], ['inbound', 'I']].forEach(function (pair) {
      var bound = pair[0];
      chain = chain.then(function () {
        return fetchJson(KMB_API + '/route/' + encodeURIComponent(code) + '/' + bound + '/1')
          .then(function (json) {
            if (json && json.data && json.data.route) {
              dirs.push({ key: bound, label: json.data.orig_tc + ' → ' + json.data.dest_tc, serviceType: json.data.service_type || '1' });
            }
          }).catch(function () {});
      });
    });
    return chain.then(function () {
      return dirs.length ? { op: 'KMB', dirs: dirs, serviceType: dirs[0].serviceType } : null;
    });
  }

  // 城巴：/route 一次拿齊頭尾站（去程 / 回程方向名直接寫對，不用等站表載入才補）
  function tryCtb(code) {
    return fetchJson(CTB_API + '/route/CTB/' + encodeURIComponent(code))
      .then(function (json) {
        var d = json && json.data;
        if (!d || !d.route) return null;
        return {
          op: 'CTB',
          dirs: [
            { key: 'outbound', label: d.orig_tc + ' → ' + d.dest_tc, serviceType: '1' },
            { key: 'inbound', label: d.dest_tc + ' → ' + d.orig_tc, serviceType: '1' }
          ],
          serviceType: '1'
        };
      })
      .catch(function () { return null; });
  }

  function renderBusDirections(preferKey) {
    var key = preferKey;
    if (!key || !state.bus.dirs.some(function (d) { return d.key === key; })) {
      key = state.bus.dirs.length ? state.bus.dirs[0].key : '';
    }
    renderDirButtons(state.bus.dirs.map(function (d) {
      return { key: d.key, label: d.label };
    }), key, function (k) { busSetDirection(k); });
    busSetDirection(key);
  }

  function busSetDirection(key) {
    if (!key) return;
    state.bus.dirKey = key;
    var btns = $('dirBtns').querySelectorAll('.seg-btn');
    state.bus.dirs.forEach(function (d, i) {
      if (btns[i]) btns[i].classList.toggle('active', d.key === key);
    });
    busLoadStops();
  }

  function busLoadStops(preferStop) {
    var bus = state.bus;
    if (!bus.code || !bus.dirKey) return Promise.resolve();
    setStatus('idle', '正在載入巴士站…');
    var dir = bus.dirKey;
    var url = bus.op === 'KMB'
      ? KMB_API + '/route-stop/' + encodeURIComponent(bus.code) + '/' + dir + '/' + bus.serviceType
      : CTB_API + '/route-stop/CTB/' + encodeURIComponent(bus.code) + '/' + dir;
    return fetchJson(url).then(function (json) {
      var raw = (json && json.data) || [];
      var stops = raw.map(function (r) {
        return { stop_seq: Number(r.seq), stop_id: r.stop, name_tc: '', name_en: '' };
      });
      // 站名要逐個查：九巴 /stop/{id}、城巴 /stop/{id}，並行查
      var nameUrl = bus.op === 'KMB'
        ? function (id) { return KMB_API + '/stop/' + id; }
        : function (id) { return CTB_API + '/stop/' + id; };
      return Promise.all(stops.map(function (s) {
        return fetchJson(nameUrl(s.stop_id)).then(function (j) {
          if (j && j.data) { s.name_tc = j.data.name_tc || ''; s.name_en = j.data.name_en || ''; }
          return s;
        }).catch(function () { return s; });
      })).then(function (filled) {
        bus.stops = filled.filter(function (s) { return s.name_tc; });
        var stop = preferStop;
        if (!stop || !bus.stops.some(function (s) { return s.stop_seq === stop; })) {
          stop = bus.stops.length ? bus.stops[0].stop_seq : 0;
        }
        busSetStop(stop);
      });
    }).catch(function () {
      setStatus('err', '巴士站載入失敗，請再試一次');
    });
  }

  function busSetStop(seq) {
    if (!seq) return;
    var bus = state.bus;
    bus.stopSeq = seq;
    var stop = null;
    bus.stops.forEach(function (s) { if (s.stop_seq === seq) stop = s; });
    bus.stopId = stop ? stop.stop_id : '';
    renderStops(bus.stops, seq, busSetStop);
    busLoadEta();
  }

  function busLoadEta() {
    var bus = state.bus;
    if (!bus.code || !bus.stopSeq) return Promise.resolve();
    setStatus('idle', '正在查巴士到站時間…');
    if (bus.op === 'KMB') {
      return fetchJson(KMB_API + '/route-eta/' + encodeURIComponent(bus.code) + '/' + bus.serviceType)
        .then(function (json) {
          var list = ((json && json.data) || [])
            .filter(function (e) { return Number(e.seq) === bus.stopSeq && e.eta; })
            .map(function (e) {
              var min = minsFrom(e.eta);
              return min === null ? null : { min: min, time: fmtTime(e.eta), remark: e.rmk_tc || '' };
            })
            .filter(Boolean)
            .slice(0, 3);
          renderEtaCards(list);
          stampUpdated();
        })
        .catch(function () { setStatus('err', '到站時間查不到，請再試一次'); });
    }
    // 城巴
    return fetchJson(CTB_API + '/eta/CTB/' + bus.stopId + '/' + encodeURIComponent(bus.code))
      .then(function (json) {
        var dirCode = bus.dirKey === 'outbound' ? 'O' : 'I';
        var list = ((json && json.data) || [])
          .filter(function (e) { return e.dir === dirCode && e.eta; })
          .map(function (e) {
            var min = minsFrom(e.eta);
            return min === null ? null : { min: min, time: fmtTime(e.eta), remark: (e.rmk_tc || '') + (e.dest_tc ? ' · 往 ' + e.dest_tc : '') };
          })
          .filter(Boolean)
          .slice(0, 3);
        renderEtaCards(list);
        stampUpdated();
      })
      .catch(function () { setStatus('err', '到站時間查不到，請再試一次'); });
  }

  /* ================= 港鐵 ================= */
  var MTR_LINES = {
    TWL: { name: '荃灣綫', stations: [['CEN', '中環'], ['ADM', '金鐘'], ['TST', '尖沙咀'], ['JOR', '佐敦'], ['YMT', '油麻地'], ['MOK', '旺角'], ['PRC', '太子'], ['SSP', '深水埗'], ['CSW', '長沙灣'], ['LAK', '荔枝角'], ['MEF', '美孚'], ['LCK', '荔景'], ['KWF', '葵芳'], ['KWH', '葵興'], ['TWH', '大窩口'], ['TSW', '荃灣']] },
    KTL: { name: '觀塘綫', stations: [['WHA', '黃埔'], ['HOM', '何文田'], ['YMT', '油麻地'], ['MOK', '旺角'], ['PRC', '太子'], ['SKM', '石硤尾'], ['KOT', '九龍塘'], ['LOF', '樂富'], ['WTS', '黃大仙'], ['DIH', '鑽石山'], ['CHH', '彩虹'], ['KOB', '九龍灣'], ['NTK', '牛頭角'], ['KWT', '觀塘'], ['LTI', '藍田'], ['YAT', '油塘'], ['TIK', '調景嶺']] },
    ISL: { name: '港島綫', stations: [['KET', '堅尼地城'], ['HKU', '香港大學'], ['SYP', '西營盤'], ['SHW', '上環'], ['CEN', '中環'], ['ADM', '金鐘'], ['WAC', '灣仔'], ['CAB', '銅鑼灣'], ['TIH', '天后'], ['FOH', '炮台山'], ['NOP', '北角'], ['QUB', '鰂魚涌'], ['TAW', '太古'], ['SWH', '西灣河'], ['SKW', '筲箕灣'], ['HFC', '杏花邨'], ['CHW', '柴灣']] },
    TCL: { name: '東涌綫', stations: [['HOK', '香港'], ['KOW', '九龍'], ['OLY', '奧運'], ['NAC', '南昌'], ['LAK', '荔枝角'], ['TSY', '青衣'], ['SUN', '欣澳'], ['TUC', '東涌']] },
    TKL: { name: '將軍澳綫', stations: [['NOP', '北角'], ['QUB', '鰂魚涌'], ['YAT', '油塘'], ['TIK', '調景嶺'], ['TKO', '將軍澳'], ['HAH', '坑口'], ['POA', '寶琳'], ['LHP', '康城']] },
    EAL: { name: '東鐵綫', upName: '羅湖 / 落馬洲', stations: [['ADM', '金鐘'], ['EXC', '會展'], ['HUH', '紅磡'], ['MKK', '旺角東'], ['KOT', '九龍塘'], ['TAW', '大圍'], ['SHT', '沙田'], ['FOT', '火炭'], ['RAC', '馬場'], ['UNI', '大學'], ['TAF', '大埔墟'], ['TWO', '太和'], ['FAN', '粉嶺'], ['SHS', '上水'], ['LOW', '羅湖'], ['LMC', '落馬洲']] },
    TML: { name: '屯馬綫', stations: [['TUM', '屯門'], ['SIH', '兆康'], ['HIK', '洪水橋'], ['TIS', '天水圍'], ['LOP', '朗屏'], ['YUL', '元朗'], ['KSR', '錦上路'], ['TSW', '荃灣西'], ['MEF', '美孚'], ['NAC', '南昌'], ['AUS', '柯士甸'], ['HUH', '紅磡'], ['HOM', '何文田'], ['TKW', '土瓜灣'], ['SUW', '宋皇臺'], ['KAT', '啟德'], ['DIH', '鑽石山'], ['HIN', '顯徑'], ['TAW', '大圍'], ['CKT', '車公廟'], ['STW', '沙田圍'], ['CIT', '第一城'], ['STO', '石門'], ['DIT', '大水坑'], ['HHS', '恆安'], ['MAO', '馬鞍山'], ['WKS', '烏溪沙']] },
    SIL: { name: '南港島綫', stations: [['ADM', '金鐘'], ['OCP', '海洋公園'], ['WCH', '黃竹坑'], ['LET', '利東'], ['SOH', '海怡半島']] },
    DRL: { name: '迪士尼綫', stations: [['SUN', '欣澳'], ['DIS', '迪士尼']] },
    AEX: { name: '機場快綫', stations: [['HOK', '香港'], ['KOW', '九龍'], ['TSY', '青衣'], ['AIR', '機場'], ['AWE', '博覽館']] }
  };
  var MTR_LINE_ORDER = ['TWL', 'KTL', 'ISL', 'TCL', 'TKL', 'EAL', 'TML', 'SIL', 'DRL', 'AEX'];

  function mtrStationName(line, code) {
    var st = (MTR_LINES[line] || {}).stations || [];
    for (var i = 0; i < st.length; i++) if (st[i][0] === code) return st[i][1];
    return code;
  }

  function renderMtrLines() {
    var sel = $('lineSelect');
    if (sel.options.length) { sel.value = state.mtr.line; return; }
    MTR_LINE_ORDER.forEach(function (code) {
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = MTR_LINES[code].name;
      sel.appendChild(opt);
    });
    sel.value = state.mtr.line;
  }

  function mtrRenderStations(preferSta) {
    var line = MTR_LINES[state.mtr.line];
    var sel = $('stationSelect');
    sel.innerHTML = '';
    line.stations.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s[0];
      opt.textContent = s[1];
      sel.appendChild(opt);
    });
    var sta = preferSta || state.mtr.sta;
    if (!sta || !line.stations.some(function (s) { return s[0] === sta; })) {
      sta = line.stations.length ? line.stations[0][0] : '';
    }
    state.mtr.sta = sta;
    sel.value = sta;
    var first = line.stations[0][1];
    var last = line.upName || line.stations[line.stations.length - 1][1];
    renderDirButtons([
      { key: 'UP', label: '往 ' + last },
      { key: 'DOWN', label: '往 ' + first }
    ], state.mtr.dir, function (k) { state.mtr.dir = k; mtrLoadEta(); });
    $('routeRegion').textContent = line.name + ' · ' + mtrStationName(state.mtr.line, sta);
    $('stopCount').textContent = line.stations.length;
    $('stopList').innerHTML = '';
  }

  function mtrLoadEta() {
    var m = state.mtr;
    if (!m.line || !m.sta) return Promise.resolve();
    setStatus('idle', '正在查港鐵班次…');
    $('routeRegion').textContent = MTR_LINES[m.line].name + ' · ' + mtrStationName(m.line, m.sta);
    return fetchJson(MTR_API + '?line=' + m.line + '&sta=' + m.sta)
      .then(function (json) {
        var d = json && json.data && json.data[m.line + '-' + m.sta];
        var trains = (d && d[m.dir]) || [];
        var list = trains
          .filter(function (t) { return t.valid === 'Y' && t.ttnt !== undefined; })
          .slice(0, 3)
          .map(function (t) {
            return {
              min: parseInt(t.ttnt, 10) || 0,
              time: (t.time || '').slice(11, 16),
              remark: '往 ' + mtrStationName(m.line, t.dest) + ' · ' + (t.plat || '') + '號月台'
            };
          });
        renderEtaCards(list);
        if (!list.length) setStatus('warn', '這個站暫無班次');
        else stampUpdated();
      })
      .catch(function () {
        setStatus('err', '港鐵班次查不到，請再試一次');
      });
  }

  /* ---------- 自動刷新：按當前模式 ---------- */
  function loadCurrentEta() {
    if (state.mode === 'mtr') return mtrLoadEta();
    if (state.roadKind === 'bus') return busLoadEta();
    return loadEta();
  }
  function startAutoRefresh() {
    if (state.etaTimer) clearInterval(state.etaTimer);
    state.etaTimer = null;
    if (!$('autoRefresh').checked) return;
    state.etaTimer = setInterval(function () {
      if (!document.hidden) loadCurrentEta();
    }, 30000);
  }

  /* ---------- 事件 ---------- */
  document.querySelectorAll('#modeTabs .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });
  $('btnSearch').addEventListener('click', function () {
    if (state.mode !== 'mtr') roadSearch($('routeInput').value, {});
  });
  $('routeInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && state.mode !== 'mtr') {
      roadSearch($('routeInput').value, {});
    }
  });
  $('btnRefresh').addEventListener('click', function () { loadCurrentEta(); });
  $('btnRefreshMtr').addEventListener('click', function () { mtrLoadEta(); });
  $('autoRefresh').addEventListener('change', function () { startAutoRefresh(); });
  $('stopFilter').addEventListener('input', function () {
    if (state.roadKind === 'bus') renderStops(state.bus.stops, state.bus.stopSeq, busSetStop);
    else renderStops(state.stops, state.stopSeq, setStop);
  });
  $('stopSelect').addEventListener('change', function () {
    if (state.roadKind === 'bus') busSetStop(Number(this.value)); else setStop(Number(this.value));
  });
  $('lineSelect').addEventListener('change', function () {
    state.mtr.line = this.value;
    state.mtr.dir = 'UP';
    mtrRenderStations();
    mtrLoadEta();
  });
  $('stationSelect').addEventListener('change', function () {
    state.mtr.sta = this.value;
    mtrLoadEta();
  });

  /* ---------- 啟動 ---------- */
  try { applyTheme(localStorage.getItem('json-wb-theme') || 'dark'); } catch (e) {}
  renderRecent();
  startAutoRefresh();

  var params = new URLSearchParams(location.search);
  var initMode = params.get('mode') || 'road';
  if (initMode === 'mtr') {
    state.mtr.line = params.get('line') || 'TWL';
    state.mtr.sta = params.get('sta') || 'KWF';
    state.mtr.dir = params.get('dir') || 'UP';
    setMode('mtr', { sta: state.mtr.sta });
  } else {
    // mode=gmb / mode=bus 都是舊地址，統一併入 road
    var initRoute = (params.get('route') || '87M').trim().toUpperCase();
    var initDir = Number(params.get('dir') || '') || undefined;
    var initStop = Number(params.get('stop') || '') || undefined;
    // 預設就是 87M 四號碼頭出發：方向 2、站 1（不用再輸一次）
    if (!params.get('route') && !params.get('dir') && !params.get('stop')) {
      initDir = 2; initStop = 1;
    }
    $('routeInput').value = initRoute;
    roadSearch(initRoute, { dir: initDir, stop: initStop, src: params.get('src') || '' });
  }
})();
