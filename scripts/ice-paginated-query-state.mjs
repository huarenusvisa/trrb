export function resumableWindow(state, fallbackWindowStart) {
  const result = state?.last_result || {};
  if (result.completed === false && result.continuation_token && result.window_start) {
    return {
      windowStart: String(result.window_start),
      startToken: String(result.continuation_token),
      resumed: true
    };
  }
  return { windowStart: fallbackWindowStart, startToken: "", resumed: false };
}

export async function collectPaginatedPages({ fetchPage, maxPages, startToken = "" }) {
  const pages = [];
  let token = startToken;
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await fetchPage(token);
    pages.push(payload);
    token = payload?.meta?.next_token || "";
    if (!token) break;
  }
  return { pages, nextToken: token, completed: !token };
}

export async function persistBeforeState({
  rows,
  persistRows,
  saveState,
  previousState,
  stateBase,
  latestSeenId,
  windowStart,
  nextToken,
  pages,
  found,
  resumed,
  now
}) {
  const inserted = await persistRows(rows);
  const completed = !nextToken;
  const nextState = {
    ...stateBase,
    last_seen_id: completed ? (latestSeenId || previousState?.last_seen_id || null) : (previousState?.last_seen_id || null),
    last_run_at: now,
    last_success_at: completed ? now : (previousState?.last_success_at || null),
    last_error: completed ? null : "pagination incomplete: continuation token retained",
    last_result: {
      ...stateBase.last_result,
      found,
      inserted,
      pages,
      completed,
      resumed,
      window_start: windowStart,
      continuation_token: nextToken || null
    },
    updated_at: now
  };
  await saveState(nextState);
  return { inserted, completed, nextState };
}
