/* 在 <head> 同步加载：首绘前就把保存的主题写到 <html data-theme> 上，
   避免新页面先按默认深色画一帧、等页面底部 JS 跑完才翻成浅色
   （切换工具时浅色主题下黑屏一闪的根因）。
   另管页面切换过渡的两个标记（只在工具间跳转时播进入动画，冷打开不播）：
   - json-wb-nav：goToTool 跳转前写入 sessionStorage，新页面首绘前读到就加 nav-enter，用完即删
   - pagereveal：新页面若是经 View Transitions 跨页揭示，加 vt，手动淡入就不重复播
   纯本站脚本，CSP script-src 'self' 允许；只读 localStorage / sessionStorage，不写 localStorage。 */
(function () {
  try {
    var t = localStorage.getItem('json-wb-theme');
    if (t === 'dark' || t === 'light' || t === 'retro' || t === 'oracle' || t === 'oracle-light' || t === 'datagrip' || t === 'jetbrains' || t === 'tokyonight') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
  try {
    if (sessionStorage.getItem('json-wb-nav') === '1') {
      document.documentElement.classList.add('nav-enter');
      sessionStorage.removeItem('json-wb-nav');
    }
  } catch (e) {}
  window.addEventListener('pagereveal', function (e) {
    if (e.viewTransition) document.documentElement.classList.add('vt');
  });
})();
