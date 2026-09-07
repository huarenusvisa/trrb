const PLATFORMS = new Set(['ios', 'android']);
const EXPO_TOKEN = /^Expo(?:nent)?PushToken\[[^\]\s]{10,512}\]$/;

function normalizePushTokenClaim(value) {
  const platform = String(value?.platform || '').trim().toLowerCase();
  const expoPushToken = String(value?.expo_push_token || '').trim();
  if (!PLATFORMS.has(platform)) {
    throw Object.assign(new Error('无效的推送平台'), { statusCode: 400 });
  }
  if (expoPushToken.length > 2048 || !EXPO_TOKEN.test(expoPushToken)) {
    throw Object.assign(new Error('无效的 Expo Push Token'), { statusCode: 400 });
  }
  return { platform, expoPushToken };
}

module.exports = { normalizePushTokenClaim };
