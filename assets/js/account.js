// assets/js/account.js
// Simple client-side router that loads partials into #accountContent
document.addEventListener("DOMContentLoaded", () => {
  const content   = document.getElementById("accountContent");
  const links     = document.querySelectorAll(".sidebar-nav .nav-link");
  const toggleBtn = document.getElementById("sidebarToggle");

  // Base path from HTML (account.html):
  // <main id="accountContent" data-base="{{ '' | relative_url }}">
  const BASE = (content?.dataset.base || "").replace(/\/$/, ""); // strip trailing slash

  // Map views -> partial paths (base-path safe)
  const PARTIALS = {
    account:   `${BASE}/assets/partials/account-profile.html`,
    prompt:    `${BASE}/assets/partials/account-prompt.html`,
    api:       `${BASE}/assets/partials/account-api.html`,
    reports:   `${BASE}/assets/partials/account-reports.html`,
    spendings: `${BASE}/assets/partials/account-spendings.html`,
    billing:   `${BASE}/assets/partials/account-billing.html`,
    help:      `${BASE}/assets/partials/account-help.html`,
  };

  function setActive(view) {
    links.forEach(a => a.classList.toggle("active", a.dataset.view === view));
  }

  async function loadView(view) {
    const url = PARTIALS[view] || PARTIALS.account;
    if (!content) return;

    content.setAttribute("aria-busy", "true");
    content.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <div>Loading…</div>
      </div>
    `;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      content.innerHTML = html;
      setActive(view);
      content.focus?.({ preventScroll: true });
    } catch (err) {
      console.error("Load error:", err);
      content.innerHTML = `<div class="empty">Couldn’t load this section. Please try again.</div>`;
    } finally {
      content.setAttribute("aria-busy", "false");
    }
  }

  // Handle clicks (hash navigation)
  links.forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const view = a.dataset.view || "account";
      history.pushState({ view }, "", `#${view}`);
      loadView(view);
    });
  });

  // Back/forward support
  window.addEventListener("popstate", () => {
    const view = (location.hash.replace("#", "") || "account");
    loadView(view);
  });

  // Mobile toggle (optional: collapse nav)
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      toggleBtn.setAttribute("aria-expanded", String(!expanded));
      document.querySelector(".sidebar-nav")?.classList.toggle("open");
    });
  }

  // Initial view from hash
  const initial = (location.hash.replace("#", "") || "account");
  loadView(initial);
});
