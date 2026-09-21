(function () {
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
