import { supabase } from '../auth/supabase';

export const MAX_MESSAGE_FILE_BYTES = 12 * 1024 * 1024;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

export async function uploadMessageFile(input: {
  conversationId: string;
  uri: string;
  contentType: string;
  fileName?: string | null;
  knownSize?: number | null;
}) {
  if (input.knownSize && input.knownSize > MAX_MESSAGE_FILE_BYTES) throw new Error('文件不能超过 12 MB。');
  const response = await fetch(input.uri);
  if (!response.ok) throw new Error('无法读取所选文件，请重新选择。');
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > MAX_MESSAGE_FILE_BYTES) throw new Error('文件不能超过 12 MB。');
  const { data, error } = await supabase.functions.invoke('direct-message-media', {
    body: {
      action: 'upload', conversationId: input.conversationId,
      contentType: input.contentType, fileName: input.fileName || null,
      base64: arrayBufferToBase64(buffer),
    },
  });
  if (error) throw error;
  if (!data?.path || typeof data.path !== 'string') throw new Error('附件上传失败，请重试。');
  return { path: data.path as string, size: Number(data.size || buffer.byteLength) };
}

export async function removeMessageFile(conversationId: string, path: string) {
  const { error } = await supabase.functions.invoke('direct-message-media', { body: { action: 'delete', conversationId, path } });
  if (error) throw error;
}

export async function messageFileUrls(conversationId: string, messageIds: string[]) {
  if (!messageIds.length) return {} as Record<string, string>;
  const { data, error } = await supabase.functions.invoke('direct-message-media', {
    body: { action: 'urls', conversationId, messageIds },
  });
  if (error) throw error;
  return (data?.urls && typeof data.urls === 'object' ? data.urls : {}) as Record<string, string>;
}
