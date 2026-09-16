export class ReaderServiceError extends Error {
  code: 'email' | 'message' | 'failed';
  constructor(code: 'email' | 'message' | 'failed') { super(code); this.code = code; }
}

// Reuse the registered website forms and their existing editorial inbox.
async function submit(fields: Record<string, string>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('https://trrb.net/thanks.html', {
      method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({...fields, 'bot-field':''}).toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Submission failed');
  } catch { throw new ReaderServiceError('failed'); }
  finally { clearTimeout(timer); }
}

export async function subscribeReader(email: string): Promise<void> {
  const value = email.trim();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ReaderServiceError('email');
  await submit({'form-name':'daily-subscribe', email:value});
}

export async function submitReaderTip(input: {message: string; name?: string; contact?: string}): Promise<void> {
  const message = input.message.trim();
  if (!message || message.length > 10000) throw new ReaderServiceError('message');
  await submit({'form-name':'news-tip', message, name:(input.name || '').trim().slice(0,100), contact:(input.contact || '').trim().slice(0,300)});
}
