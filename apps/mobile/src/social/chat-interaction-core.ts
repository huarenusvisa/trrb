export function callRoomFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'meet.jit.si' || url.port || url.username || url.password) return null;
    const room = url.pathname.slice(1);
    return /^TRRB-[a-f0-9]{32}$/i.test(room) ? room : null;
  } catch { return null; }
}

export function chatDateLabel(value: string, locale: string, now = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (day(date) === day(now)) return locale.startsWith('en') ? 'Today' : '今天';
  if (day(date) === day(yesterday)) return locale.startsWith('en') ? 'Yesterday' : '昨天';
  return date.toLocaleDateString(locale);
}

export type VoiceClip = { uri: string; durationMs: number };
type RecorderPort = {
  prepare: () => Promise<void>;
  start: () => void;
  stop: () => Promise<VoiceClip | null>;
  reset: () => Promise<void>;
  send: (clip: VoiceClip) => Promise<void>;
  onState: (state: 'idle' | 'preparing' | 'recording' | 'sending') => void;
  onError: (error: unknown) => void;
  onTooShort: () => void;
};

// Serializes permission/prepare/stop. A released or interrupted gesture must
// never start recording after a delayed permission dialog completes.
export function createHoldRecorder(port: RecorderPort) {
  let held = false, cancelled = false, disposed = false, active = false;
  let preparing: Promise<void> | null = null;
  let finishing: Promise<void> | null = null;
  return {
    begin() {
      if (active || disposed) return;
      active = held = true; cancelled = false;
      port.onState('preparing');
      preparing = (async () => {
        try {
          await port.prepare();
          if (held && !cancelled && !disposed) { port.start(); port.onState('recording'); }
        } catch (error) { cancelled = true; if (!disposed) port.onError(error); }
      })();
    },
    finish(cancel = false) {
      held = false; cancelled ||= cancel;
      if (!active) return Promise.resolve();
      if (finishing) return finishing;
      finishing = (async () => {
        try {
          await preparing;
          const clip = await port.stop();
          await port.reset();
          if (!cancelled && !disposed && clip) {
            if (clip.durationMs < 700) port.onTooShort();
            else { port.onState('sending'); await port.send(clip); }
          }
        } catch (error) { if (!disposed) port.onError(error); }
        finally {
          await port.reset().catch(() => undefined);
          active = false; preparing = finishing = null;
          if (!disposed) port.onState('idle');
        }
      })();
      return finishing;
    },
    dispose() { disposed = true; cancelled = true; held = false; },
  };
}
