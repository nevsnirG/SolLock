// Loaded at the start of <body> without defer (see Base.astro), so the saved theme applies before the first paint.
// The choice is remembered in this browser only.
(function () {
  var KEY = 'sollock:theme';
  var THEMES = ['system', 'light', 'dark'];

  function read() {
    try {
      var saved = localStorage.getItem(KEY);
      return THEMES.indexOf(saved) >= 0 ? saved : 'system';
    } catch (e) {
      return 'system';
    }
  }
  function apply(theme) {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }

  var current = read();
  apply(current);

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('themeBtn');
    if (!button) return;
    function label() {
      button.textContent = 'Theme: ' + current;
      button.setAttribute('aria-label', 'Colour theme: ' + current + '. Click to change.');
    }
    label();
    button.hidden = false;
    button.addEventListener('click', function () {
      current = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
      apply(current);
      try {
        localStorage.setItem(KEY, current);
      } catch (e) {
        // Not remembered, then.
      }
      label();
    });
  });
})();
