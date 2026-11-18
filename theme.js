/* 在 <head> 同步加载：首绘前就把保存的主题写到 <html data-theme> 上，
   避免新页面先按默认深色画一帧、等页面底部 JS 跑完才翻成浅色
   （切换工具时浅色主题下黑屏一闪的根因）。
   纯本站脚本，CSP script-src 'self' 允许；只读 localStorage，不写。 */
(function () {
  try {
    var t = localStorage.getItem('json-wb-theme');
    if (t === 'dark' || t === 'light' || t === 'retro' || t === 'oracle' || t === 'oracle-light' || t === 'datagrip' || t === 'jetbrains') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
