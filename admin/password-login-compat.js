(() => {
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

  function normalizeEmail(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .trim()
      .toLowerCase();
  }

  function normalizeInvisiblePasswordCharacters(value) {
    return String(value || "")
      .normalize("NFC")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  }

  async function passwordGrant(email, password) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      const error = new Error(payload.msg || payload.message || payload.error_description || `登录接口返回 ${response.status}`);
      error.status = response.status;
      error.code = payload.error_code || payload.code || "";
      throw error;
    }
    return payload;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const message = document.getElementById("login-message");
    if (!form || !emailInput || !passwordInput || !message || !window.supabase) return;

    emailInput.setAttribute("inputmode", "email");
    emailInput.setAttribute("autocapitalize", "none");
    emailInput.setAttribute("autocorrect", "off");
    emailInput.setAttribute("spellcheck", "false");
    passwordInput.setAttribute("autocapitalize", "none");
    passwordInput.setAttribute("autocorrect", "off");
    passwordInput.setAttribute("spellcheck", "false");

    const authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const button = form.querySelector('button[type="submit"]');
      const email = normalizeEmail(emailInput.value);
      const rawPassword = String(passwordInput.value || "");
      const normalizedPassword = normalizeInvisiblePasswordCharacters(rawPassword);

      if (!email || !rawPassword) {
        message.textContent = "请填写邮箱和密码。";
        return;
      }

      if (button) button.disabled = true;
      message.textContent = "正在验证账号和密码…";

      try {
        let session;
        try {
          session = await passwordGrant(email, rawPassword);
        } catch (firstError) {
          if (normalizedPassword === rawPassword) throw firstError;
          session = await passwordGrant(email, normalizedPassword);
        }

        if (!session.access_token || !session.refresh_token) {
          throw new Error("登录成功但未收到有效会话，请重新尝试。");
        }

        const { error: sessionError } = await authClient.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        if (sessionError) throw sessionError;

        message.textContent = "登录成功，正在进入后台…";
        window.location.replace(`${window.location.origin}/admin/`);
      } catch (error) {
        const status = error?.status ? `（${error.status}）` : "";
        const code = error?.code ? ` ${error.code}` : "";
        message.textContent = `登录失败${status}${code}：${error?.message || String(error)}`;
        passwordInput.focus();
        passwordInput.select();
      } finally {
        if (button) button.disabled = false;
      }
    }, true);
  });
})();
