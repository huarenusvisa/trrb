export function uploadPercent(loaded: number, total: number) {
  // 100% is reserved for the server acknowledgement, not the last sent byte.
  return total > 0 ? Math.max(0, Math.min(95, Math.floor(loaded / total * 95))) : 0;
}


export function uploadJsonWithProgress(input: { url: string; token: string; apiKey: string; body: unknown; onProgress?: (percent: number) => void; signal?: AbortSignal }, createRequest = () => new XMLHttpRequest()): Promise<{ path: string; size?: number }> {
  return new Promise((resolve, reject) => {
    const xhr = createRequest();
    let settled = false;
    const finish = (error?: Error, result?: { path: string; size?: number }) => {
      if (settled) return; settled = true;
      input.signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => { xhr.abort(); finish(new Error('附件发送已取消。')); };
    xhr.open('POST', input.url); xhr.timeout = 120_000;
    xhr.setRequestHeader('Authorization', `Bearer ${input.token}`);
    xhr.setRequestHeader('apikey', input.apiKey);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = event => { if (!settled && event.lengthComputable) input.onProgress?.(uploadPercent(event.loaded, event.total)); };
    xhr.onload = () => {
      if (settled) return;
      if (xhr.status < 200 || xhr.status >= 300) return finish(new Error('附件上传失败，请重试。'));
      try {
        const data = JSON.parse(xhr.responseText);
        if (typeof data.path !== 'string' || !data.path) throw new Error('附件上传未返回有效地址，请重试。');
        input.onProgress?.(100); finish(undefined, data);
      } catch (error) { finish(error instanceof Error ? error : new Error('附件上传失败，请重试。')); }
    };
    xhr.onerror = () => finish(new Error('网络中断，附件未发送，请重试。'));
    xhr.ontimeout = () => finish(new Error('附件发送超时，请重试。'));
    xhr.onabort = () => finish(new Error('附件发送已取消。'));
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) return abort();
    input.onProgress?.(0); xhr.send(JSON.stringify(input.body));
  });
}
