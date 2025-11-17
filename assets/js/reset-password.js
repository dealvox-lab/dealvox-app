// /assets/js/reset-password.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("resetForm");
  const passEl = document.getElementById("resetPassword");
  const statusEl = document.getElementById("resetStatus");

  // STEP 1 — Extract access_token from URL
  let params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  let accessToken = params.get("access_token");

  // Try search params as fallback
  if (!accessToken) {
    const searchParams = new URLSearchParams(window.location.search);
    accessToken = searchParams.get("access_token");
  }

  if (!accessToken) {
    statusEl.textContent = "Invalid or expired reset link.";
    form.style.display = "none";
    return;
  }

  // STEP 2 — Form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPassword = passEl.value.trim();

    if (!newPassword) {
      statusEl.textContent = "Enter a valid password.";
      return;
    }

    statusEl.textContent = "Saving…";

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, newPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        console.error("Reset failed", data);
        statusEl.textContent = "Could not update password. Try again.";
        return;
      }

      statusEl.textContent = "Password updated! Redirecting…";

      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);

    } catch (err) {
      console.error(err);
      statusEl.textContent = "Something went wrong.";
    }
  });
});
