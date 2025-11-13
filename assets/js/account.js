// /assets/js/account.js

document.addEventListener("DOMContentLoaded", () => {
  const contentEl = document.getElementById("accountContent");
  const viewEl = document.getElementById("accountView");
  const links = document.querySelectorAll(".sidebar-nav .nav-link");

  // Sidebar email element
  const emailEl = document.getElementById("sidebarEmail");

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

      // 🔍 TEMPORARY DEBUG: log what we actually got
      const text = await res.text();
      console.log("Loaded view:", view, "from", res.url, "status", res.status);
      console.log("First 120 chars:", text.slice(0, 120));
      // END DEBUG

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // If the response looks like our redirect page instead of a partial,
      // you'll see "Redirecting to your account…" in the console log above.

      viewEl.innerHTML = text;
      setActiveLink(view);
      if (location.hash !== "#" + view) {
        history.replaceState(null, "", "#" + view);
      }
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

  function viewFromHash() {
    const hash = (location.hash || "").replace("#", "");
    return hash && VIEW_FILES[hash] ? hash : "account";
  }

  links.forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const view = a.dataset.view;
      loadView(view);
    });
  });

  window.addEventListener("hashchange", () => {
    loadView(viewFromHash());
  });

  // Load sidebar email
  if (emailEl) {
    (async () => {
      try {
        const res = await fetch("/debug-auth", {
          credentials: "include"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.userSummary && data.userSummary.email) {
          emailEl.textContent = data.userSummary.email;
        } else {
          emailEl.textContent = "";
        }
      } catch (e) {
        console.error("Email load failed:", e);
        emailEl.textContent = "";
      }
    })();
  }

  // Initial load
  loadView(viewFromHash());
});
