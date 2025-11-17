// /assets/js/reset-password.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("resetForm");
  const passEl = document.getElementById("resetPassword");
  const statusEl = document.getElementById("resetStatus");

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");

  if (!accessToken) {
    statusEl.textContent = "Invalid reset link.";
    form.style.display = "none";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPassword = passEl.value.trim();
    if (!newPassword) {
      statusEl.textContent = "Enter a new password.";
      return;
    }

    statusEl.textContent = "Saving…";

    try {
      const res = await fetch("/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, newPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        statusEl.textContent = "Could not update password. Try again.";
        return;
      }

      statusEl.textContent = "Password updated! Redirecting…";
      setTimeout(() => (window.location.href = "/login"), 1500);
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Something went wrong.";
    }
  });
});
