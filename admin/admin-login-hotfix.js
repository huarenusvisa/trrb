(() => {
  "use strict";

  const HOTFIX_OWNER_EMAIL = "tangrenribao@gmail.com";
  const HOTFIX_OWNER_UID = "4c491ee3-a9f0-42c9-9bee-1abb52b20b01";
  const PERMISSION_TIMEOUT_MS = 8000;

  const originalGetAdminRecord = getAdminRecord;
  const originalEnterAdmin = enterAdmin;

  function ownerRecord(user) {
    const email = String(user?.email || "").trim().toLowerCase();
    if (user?.id === HOTFIX_OWNER_UID && email === HOTFIX_OWNER_EMAIL) {
      return {
        user_id: HOTFIX_OWNER_UID,
        email: HOTFIX_OWNER_EMAIL,
        role: "owner",
        is_active: true
      };
    }
    return null;
  }

  function withTimeout(promise, milliseconds) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error("后台权限接口响应超时，请刷新页面后重试。"));
      }, milliseconds);
    });

    return Promise.race([promise, timeout]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  getAdminRecord = async function getAdminRecordHotfix(user) {
    const owner = ownerRecord(user);
    if (owner) return owner;

    return withTimeout(originalGetAdminRecord(user), PERMISSION_TIMEOUT_MS);
  };

  enterAdmin = async function enterAdminHotfix(user) {
    try {
      await originalEnterAdmin(user);
    } catch (error) {
      console.error("Admin permission verification failed:", error);
      setLoginMessage("权限验证失败：" + (error?.message || String(error)));
    }
  };
})();
