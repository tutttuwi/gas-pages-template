(function () {
  var THEME_KEY = "{{ themeStorageKey }}";
  var THEMES = { system: true, light: true, dark: true };
  var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-theme-value]"));

  function readStoredTheme() {
    try {
      var stored = window.localStorage.getItem(THEME_KEY);
      if (THEMES[stored]) {
        return stored;
      }
    } catch (error) {
      // Privacy mode or blocked storage: stay on the document attribute.
    }
    return document.documentElement.getAttribute("data-theme");
  }

  function applyTheme(theme) {
    var next = THEMES[theme] ? theme : "system";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch (error) {
      // Ignore persistence failures; the in-page choice still applies.
    }
    buttons.forEach(function (button) {
      var selected = button.getAttribute("data-theme-value") === next;
      button.setAttribute("aria-checked", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    });
  }

  applyTheme(readStoredTheme());

  buttons.forEach(function (button, index) {
    button.addEventListener("click", function () {
      applyTheme(button.getAttribute("data-theme-value"));
    });
    button.addEventListener("keydown", function (event) {
      var offset =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (!offset) {
        return;
      }
      event.preventDefault();
      var nextButton = buttons[(index + offset + buttons.length) % buttons.length];
      nextButton.focus();
      applyTheme(nextButton.getAttribute("data-theme-value"));
    });
  });

  var pages = Array.prototype.slice.call(document.querySelectorAll("[data-page]"));
  if (!pages.length) {
    return;
  }

  function pageIdFromHash() {
    var hash = window.location.hash.replace(/^#/, "");
    if (hash && document.getElementById(hash)) {
      return hash;
    }
    return pages[0].id;
  }

  function showPage(id) {
    pages.forEach(function (page) {
      page.hidden = page.id !== id;
    });
    Array.prototype.forEach.call(document.querySelectorAll(".nav a"), function (link) {
      if (link.getAttribute("href") === "#" + id) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  window.addEventListener("hashchange", function () {
    showPage(pageIdFromHash());
  });

  showPage(pageIdFromHash());
})();
