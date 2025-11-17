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
      statusEl.classList.remove("success");
      statusEl.classList.add("error");
      return;
    }

    statusEl.textContent = "Sending reset link…";
    statusEl.classList.remove("error", "success");

    try {
      const res = await fetch("/api/forgot-password", {   // 👈 changed path
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        console.error("Forgot password API error:", res.status, data);
        statusEl.textContent = "Could not send reset link. Try again.";
        statusEl.classList.remove("success");
        statusEl.classList.add("error");
        return;
      }

      statusEl.textContent = "Check your inbox for the reset link.";
      statusEl.classList.remove("error");
      statusEl.classList.add("success");
      emailEl.value = "";
    } catch (err) {
      console.error("Forgot password JS error:", err);
      statusEl.textContent = "Something went wrong. Try again.";
      statusEl.classList.remove("success");
      statusEl.classList.add("error");
    }
  });
});
