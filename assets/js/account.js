// /assets/js/account.js

document.addEventListener("DOMContentLoaded", () => {
  const contentEl = document.getElementById("accountContent");
  const viewEl = document.getElementById("accountView");
  const links = document.querySelectorAll(".sidebar-nav .nav-link");

  // Map logical view -> partial file
  const VIEW_FILES = {
    account:   "/partials/account-profile.html",
    prompt:    "/partials/account-prompt.html",
    api:       "/partials/account-api.html",
    reports:   "/partials/account-reports.html",
    spendings: "/partials/account-spendings.html",
    billing:   "/partials/account-billing.html",
    help:      "/partials/account-help.html",
  };

  function setActiveLink(view) {
    links.forEach(a => {
      a.classList.toggle("active", a.dataset.view === view);
    });
  }

  async function loadView(view) {
    const file = VIEW_FILES[view];
    if (!file) {
      // Fallback: show an empty state
      viewEl.innerHTML = `
        <div class="empty">
          Unknown section: <strong>${view}</strong>
        </div>`;
      return;
    }

    try {
      contentEl.setAttribute("aria-busy", "true");
      viewEl.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <div>Loading…</div>
        </div>`;

      const res = await fetch(file, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      viewEl.innerHTML = html;
      setActiveLink(view);
      // Keep hash in sync so /account#billing works on reload
      if (location.hash !== "#" + view) {
        history.replaceState(null, "", "#"+view);
      }

      // Move focus for accessibility
      contentEl.focus();
    } catch (err) {
      console.error("Failed to load view", view, err);
      viewEl.innerHTML = `
        <div class="empty">
          Could not load this section. Please try again.
        </div>`;
    } finally {
      contentEl.setAttribute("aria-busy", "false");
    }
  }

  // Click handlers for sidebar
  links.forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const view = a.dataset.view;
      loadView(view);
    });
  });

  // Support direct links like /account#billing
  function viewFromHash() {
    const hash = (location.hash || "").replace("#", "");
    return hash && VIEW_FILES[hash] ? hash : "account";
  }

  window.addEventListener("hashchange", () => {
    const view = viewFromHash();
    loadView(view);
  });

  // Load email into sidebar
const emailEl = document.getElementById("accountEmail");

(async () => {
  try {
    const res = await fetch("/functions/debug-auth.js"); // or your /auth/me endpoint
    const data = await res.json();
    emailEl.textContent = data.email || "";
  } catch (e) {
    emailEl.textContent = "";
  }
})();


  // Initial load
  loadView(viewFromHash());
});
