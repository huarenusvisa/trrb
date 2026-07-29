(() => {
  const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
  const FULL_WIDTH_RE = /[\uFF01-\uFF5E\u3000]/;

  function classify(value) {
    const text = String(value || "");
    const hasZeroWidth = ZERO_WIDTH_RE.test(text);
    ZERO_WIDTH_RE.lastIndex = 0;
    const hasFullWidth = FULL_WIDTH_RE.test(text);
    const hasLeadingOrTrailingSpace = text !== text.trim();
    const hasNonAscii = /[^\x20-\x7E]/.test(text);
    return { hasZeroWidth, hasFullWidth, hasLeadingOrTrailingSpace, hasNonAscii };
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("login-form");
    const password = document.getElementById("login-password");
    const message = document.getElementById("login-message");
    if (!form || !password || !message) return;

    const tools = document.createElement("div");
    tools.style.display = "grid";
    tools.style.gap = "8px";
    tools.style.marginTop = "8px";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "显示密码并核对";
    toggle.style.background = "#eef2f7";
    toggle.style.color = "#0b1730";

    const audit = document.createElement("div");
    audit.setAttribute("aria-live", "polite");
    audit.style.fontSize = "14px";
    audit.style.lineHeight = "1.45";
    audit.style.color = "#64748b";

    function updateAudit() {
      const value = String(password.value || "");
      if (!value) {
        audit.textContent = "密码输入检测：尚未输入。";
        return;
      }
      const info = classify(value);
      const warnings = [];
      if (info.hasZeroWidth) warnings.push("含不可见字符");
      if (info.hasFullWidth) warnings.push("含全角字符");
      if (info.hasLeadingOrTrailingSpace) warnings.push("首尾有空格");
      if (info.hasNonAscii && !info.hasFullWidth) warnings.push("含非ASCII字符");
      audit.textContent = `密码输入检测：${Array.from(value).length} 个字符${warnings.length ? `；警告：${warnings.join("、")}` : "；字符格式正常"}。`;
    }

    toggle.addEventListener("click", () => {
      const showing = password.type === "text";
      password.type = showing ? "password" : "text";
      toggle.textContent = showing ? "显示密码并核对" : "隐藏密码";
      password.focus();
      updateAudit();
    });

    password.addEventListener("input", updateAudit);
    password.addEventListener("change", updateAudit);

    form.addEventListener("submit", (event) => {
      const info = classify(password.value);
      if (info.hasZeroWidth || info.hasFullWidth || info.hasLeadingOrTrailingSpace) {
        event.preventDefault();
        event.stopImmediatePropagation();
        message.textContent = "密码中检测到手机输入法产生的全角、隐藏字符或首尾空格。请点“显示密码并核对”，删除异常字符后重新输入。";
        password.focus();
        password.select();
      }
    }, true);

    tools.append(toggle, audit);
    message.before(tools);
    updateAudit();
  });
})();
