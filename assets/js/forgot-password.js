// /assets/js/forgot-password.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("forgotForm");
  const emailEl = document.getElementById("forgotEmail");
  const statusEl = document.getElementById("forgotStatus");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailEl.value.trim();
    if (!email) {
      statusEl.textContent = "Please enter your email.";
      return;
    }

    statusEl.textContent = "Sending reset link…";

    try {
      const res = await fetch("/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        statusEl.textContent = "Could not send reset link. Try again.";
        return;
      }

      statusEl.textContent = "Check your inbox for the reset link.";
      emailEl.value = "";
    } catch (err) {
      statusEl.textContent = "Something went wrong. Try again.";
      console.error(err);
    }
  });
});
