export const IMAGE_FIRST_RETRY_DELAY_MS = 900;
export const IMAGE_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
export const IMAGE_FAILURE_MAX_ENTRIES = 100;

export type ImageFailureState = { attempts: number; retryAt: number; lastFailureAt: number };

export function nextImageFailure(previous: ImageFailureState | undefined, now = Date.now()): ImageFailureState {
  if (previous && previous.retryAt > now) return previous;
  const attempts = Math.min(2, (previous?.attempts ?? 0) + 1);
  return {
    attempts,
    retryAt: now + (attempts === 1 ? IMAGE_FIRST_RETRY_DELAY_MS : IMAGE_FAILURE_COOLDOWN_MS),
    lastFailureAt: now,
  };
}

export function imageRetryDelay(state: ImageFailureState | undefined, now = Date.now()) {
  return state ? Math.max(0, state.retryAt - now) : 0;
}

export function imageFailureKeysToPrune(
  entries: Array<{ key: string; state: ImageFailureState }>,
  maxEntries = IMAGE_FAILURE_MAX_ENTRIES,
) {
  return [...entries]
    .sort((a, b) => b.state.lastFailureAt - a.state.lastFailureAt)
    .slice(Math.max(0, maxEntries))
    .map((entry) => entry.key);
}
