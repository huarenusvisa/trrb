(() => {
  const SUPABASE_URL = "https://fwiznbpsqkfgkvyznebz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const message = document.getElementById("login-message");
    if (!form || !emailInput || !passwordInput || !message || !window.supabase) return;

    const tools = document.createElement("div");
    tools.style.display = "grid";
    tools.style.gap = "10px";
    tools.style.marginTop = "10px";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "显示密码";
    toggle.style.background = "#eef2f7";
    toggle.style.color = "#0b1730";
    toggle.addEventListener("click", () => {
      const showing = passwordInput.type === "text";
      passwordInput.type = showing ? "password" : "text";
      toggle.textContent = showing ? "显示密码" : "隐藏密码";
      passwordInput.focus();
    });

    const magic = document.createElement("button");
    magic.type = "button";
    magic.textContent = "手机收邮件免密码登录";
    magic.style.background = "#0f766e";
    magic.style.color = "#fff";

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    magic.addEventListener("click", async () => {
      const email = String(emailInput.value || "").trim().toLowerCase();
      if (!email) {
        message.textContent = "请先填写管理员邮箱。";
        emailInput.focus();
        return;
      }
      magic.disabled = true;
      message.textContent = "正在发送安全登录邮件…";
      try {
        const redirectTo = `${location.origin}/admin/`;
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
        });
        if (error) throw error;
        message.textContent = "登录邮件已发送。请在这台手机上打开邮件中的登录链接。";
      } catch (error) {
        message.textContent = "免密码登录发送失败：" + (error?.message || String(error));
      } finally {
        magic.disabled = false;
      }
    });

    tools.append(toggle, magic);
    message.before(tools);
  });
})();
