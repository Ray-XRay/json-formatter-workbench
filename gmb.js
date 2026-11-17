/* 小巴到站：專線小巴實時到站看板。
   數據：運輸署經 data.gov.hk 的專線小巴實時到站 API（data.etagmb.gov.hk），
   每分鐘更新，無需 key，瀏覽器直接請求（CORS: access-control-allow-origin: *）。
   流程：輸路線 -> 自動試 NT/KLN/HKI 找 route_id -> 選方向 -> 選站 -> 查 ETA。
   ETA 回來的 diff 欄位就是分鐘數，直接用，不用自己算時間差。 */
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
  brandMenu.addEventListener('click', function (e) {
    var item = e.target.closest('.brand-item');
    if (!item) return;
    var page = item.getAttribute('data-page');
    closeBrand();
    if (page && page !== 'gmb.html') location.href = page;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeBrand();
  });

  /* ---------- API ---------- */
  var API = 'https://data.etagmb.gov.hk';
  var REGIONS = ['NT', 'KLN', 'HKI'];
  var REGION_NAME = { NT: '新界', KLN: '九龍', HKI: '港島' };

  var state = {
    routeCode: '', region: '', routeId: 0,
    directions: [], routeSeq: 0,
    stops: [], stopSeq: 0, stopName: '',
    etaTimer: null, loading: false
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

  /* ---------- 最近路線（只存路線號碼在本機） ---------- */
  function getRecent() {
    try {
      var v = JSON.parse(localStorage.getItem('gmb-wb-recent') || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string'; }).slice(0, 5) : [];
    } catch (e) { return []; }
  }
  function saveRecent(code) {
    try {
      var list = getRecent().filter(function (x) { return x !== code; });
      list.unshift(code);
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
    list.forEach(function (code) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = code;
      b.addEventListener('click', function () {
        $('routeInput').value = code;
        loadRoute(code, {});
      });
      box.appendChild(b);
    });
  }

  /* ---------- 路線 / 方向 / 站 ---------- */
  function loadRoute(code, opts) {
    code = (code || '').trim().toUpperCase();
    if (!code) { setStatus('warn', '請先輸入路線號碼'); return Promise.resolve(false); }
    if (state.loading) return Promise.resolve(false);
    state.loading = true;
    setStatus('idle', '正在找 ' + code + '…');
    $('routeInput').value = code;
    var found = null;
    var chain = Promise.resolve();
    REGIONS.forEach(function (region) {
      chain = chain.then(function () {
        if (found) return;
        return fetchJson(API + '/route/' + region + '/' + encodeURIComponent(code))
          .then(function (json) {
            if (!found && json && Array.isArray(json.data) && json.data.length) {
              found = { region: region, route: json.data[0] };
            }
          })
          .catch(function () { /* 該地區沒有，試下一個 */ });
      });
    });
    return chain.then(function () {
      state.loading = false;
      if (!found) {
        setStatus('err', '找不到路線 ' + code + '，只支援專線小巴');
        showToast('找不到 ' + code + '，檢查一下號碼');
        return false;
      }
      state.routeCode = code;
      state.region = found.region;
      state.routeId = found.route.route_id;
      state.directions = found.route.directions || [];
      saveRecent(code);
      $('routeCard').hidden = false;
      $('routeCode').textContent = code;
      $('routeRegion').textContent = REGION_NAME[found.region] || found.region;
      renderDirections(opts.dir);
      return true;
    }).catch(function (err) {
      state.loading = false;
      setStatus('err', '查不到，請檢查網絡後再試');
      showToast('請求失敗：' + (err && err.message ? err.message : '網絡錯誤'));
      return false;
    });
  }

  function renderDirections(preferSeq) {
    var box = $('dirBtns');
    box.innerHTML = '';
    state.directions.forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'seg-btn';
      b.type = 'button';
      b.textContent = d.orig_tc + ' → ' + d.dest_tc;
      b.setAttribute('data-seq', d.route_seq);
      b.addEventListener('click', function () { setDirection(d.route_seq, {}); });
      box.appendChild(b);
    });
    var seq = preferSeq;
    if (!seq || !state.directions.some(function (d) { return d.route_seq === seq; })) {
      seq = state.directions.length ? state.directions[0].route_seq : 0;
    }
    setDirection(seq, {});
  }

  function setDirection(seq, opts) {
    if (!seq) return;
    state.routeSeq = seq;
    var btns = $('dirBtns').querySelectorAll('.seg-btn');
    btns.forEach(function (b) {
      b.classList.toggle('active', Number(b.getAttribute('data-seq')) === seq);
    });
    loadStops(opts.stop);
  }

  function loadStops(preferStop) {
    if (!state.routeId || !state.routeSeq) return Promise.resolve();
    setStatus('idle', '正在載入站點…');
    return fetchJson(API + '/route-stop/' + state.routeId + '/' + state.routeSeq)
      .then(function (json) {
        state.stops = (json && json.data && json.data.route_stops) || [];
        renderStops();
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

  function renderStops() {
    var sel = $('stopSelect');
    sel.innerHTML = '';
    state.stops.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.stop_seq;
      opt.textContent = s.stop_seq + '. ' + s.name_tc;
      if (s.stop_seq === state.stopSeq) opt.selected = true;
      sel.appendChild(opt);
    });
    $('stopCount').textContent = state.stops.length || '—';
    var box = $('stopList');
    var q = ($('stopFilter').value || '').trim();
    box.innerHTML = '';
    var shown = state.stops.filter(function (s) {
      return !q || s.name_tc.indexOf(q) !== -1 || s.name_en.toLowerCase().indexOf(q.toLowerCase()) !== -1;
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
      b.className = 'stop-item' + (s.stop_seq === state.stopSeq ? ' active' : '');
      b.type = 'button';
      b.innerHTML = '';
      var num = document.createElement('span');
      num.className = 'stop-num';
      num.textContent = s.stop_seq;
      var name = document.createElement('span');
      name.className = 'stop-name';
      name.textContent = s.name_tc;
      b.appendChild(num);
      b.appendChild(name);
      b.addEventListener('click', function () { setStop(s.stop_seq); });
      box.appendChild(b);
    });
  }

  function setStop(seq) {
    if (!seq) return;
    state.stopSeq = seq;
    var stop = null;
    state.stops.forEach(function (s) { if (s.stop_seq === seq) stop = s; });
    state.stopName = stop ? stop.name_tc : '';
    renderStops();
    loadEta();
  }

  /* ---------- ETA 看板 ---------- */
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
      var diff = item.diff;
      minEl.textContent = diff <= 0 ? '即到' : String(diff);
      if (diff > 0) {
        var unit = document.createElement('span');
        unit.className = 'eta-unit';
        unit.textContent = '分鐘';
        minEl.appendChild(unit);
      }
      timeEl.textContent = fmtTime(item.timestamp) + ' 到站';
      remarkEl.textContent = item.remarks_tc || '';
      card.classList.toggle('soon', diff <= 0);
    }
  }

  function loadEta() {
    if (!state.routeId || !state.routeSeq || !state.stopSeq) return Promise.resolve();
    setStatus('idle', '正在查到站時間…');
    return fetchJson(API + '/eta/route-stop/' + state.routeId + '/' + state.routeSeq + '/' + state.stopSeq)
      .then(function (json) {
        var data = (json && json.data) || {};
        if (!data.enabled) {
          renderEtaCards([]);
          setStatus('warn', (data && data.eta && data.eta.length ? '' : '這站暫無實時到站資料'));
          $('detailStats').textContent = '';
          return;
        }
        renderEtaCards(data.eta || []);
        var stamp = fmtNow();
        $('routeUpdated').textContent = '更新於 ' + stamp;
        $('detailStats').textContent = '每分鐘更新 · ' + stamp;
        setStatus('ok', '已更新 ' + stamp);
      })
      .catch(function () {
        setStatus('err', '到站時間查不到，請再試一次');
      });
  }

  function startAutoRefresh() {
    if (state.etaTimer) clearInterval(state.etaTimer);
    state.etaTimer = null;
    if (!$('autoRefresh').checked) return;
    state.etaTimer = setInterval(function () {
      if (!document.hidden) loadEta();
    }, 30000);
  }

  /* ---------- 事件 ---------- */
  $('btnSearch').addEventListener('click', function () { loadRoute($('routeInput').value, {}); });
  $('routeInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loadRoute($('routeInput').value, {});
  });
  $('btnRefresh').addEventListener('click', function () { loadEta(); });
  $('autoRefresh').addEventListener('change', function () { startAutoRefresh(); });
  $('stopFilter').addEventListener('input', function () { renderStops(); });
  $('stopSelect').addEventListener('change', function () { setStop(Number(this.value)); });

  /* ---------- 啟動 ---------- */
  try { applyTheme(localStorage.getItem('json-wb-theme') || 'dark'); } catch (e) {}
  renderRecent();
  startAutoRefresh();

  var params = new URLSearchParams(location.search);
  var initRoute = (params.get('route') || '87M').trim().toUpperCase();
  var initDir = Number(params.get('dir') || '') || undefined;
  var initStop = Number(params.get('stop') || '') || undefined;
  // 預設就是 87M 四號碼頭出發：方向 2、站 1（不用再輸一次）
  if (!params.get('route') && !params.get('dir') && !params.get('stop')) {
    initDir = 2; initStop = 1;
  }
  $('routeInput').value = initRoute;
  loadRoute(initRoute, { dir: initDir, stop: initStop });
})();
