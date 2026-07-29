(() => {
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

  function normalizeEmail(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .trim()
      .toLowerCase();
  }

  function sanitizedPassword(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .trim();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const message = document.getElementById("login-message");
    if (!form || !emailInput || !passwordInput || !window.supabase) return;

    emailInput.setAttribute("autocapitalize", "none");
    emailInput.setAttribute("autocorrect", "off");
    emailInput.setAttribute("spellcheck", "false");
    passwordInput.setAttribute("autocapitalize", "none");
    passwordInput.setAttribute("autocorrect", "off");
    passwordInput.setAttribute("spellcheck", "false");

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "trrb-admin-mobile-auth"
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      if (message) message.textContent = "正在登录…";

      const email = normalizeEmail(emailInput.value);
      const rawPassword = String(passwordInput.value || "");
      const cleanPassword = sanitizedPassword(rawPassword);

      try {
        await client.auth.signOut({ scope: "local" }).catch(() => {});

        let result = await client.auth.signInWithPassword({ email, password: rawPassword });
        if (result.error && cleanPassword !== rawPassword) {
          result = await client.auth.signInWithPassword({ email, password: cleanPassword });
        }

        if (result.error) {
          if (message) {
            message.textContent = "登录失败：手机自动填充的密码可能不是当前密码。请点密码框，删除全部内容后手动输入一次。";
          }
          passwordInput.focus();
          passwordInput.select();
          return;
        }

        // 同步到主后台客户端使用的默认 Supabase 会话存储。
        const mainClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        if (result.data?.session) {
          await mainClient.auth.setSession({
            access_token: result.data.session.access_token,
            refresh_token: result.data.session.refresh_token
          });
        }
        location.reload();
      } catch (error) {
        if (message) message.textContent = "登录失败：" + (error?.message || String(error));
      } finally {
        if (button) button.disabled = false;
      }
    }, true);
  });
})();
