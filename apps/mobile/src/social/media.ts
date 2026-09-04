import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from '../auth/supabase';

export const PROFILE_MEDIA_BUCKET = 'profile-media';
export const PROFILE_POST_MEDIA_BUCKET = 'profile-post-media';

export function publicProfileMediaUrl(path?: string | null) {
  if (!path) return null;
  return supabase.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function signedPostMediaUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(PROFILE_POST_MEDIA_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

function extensionFor(asset: ImagePickerAsset) {
  const fromName = asset.fileName?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName && fromName.length <= 5) return fromName;
  const mime = asset.mimeType || '';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic';
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/webm') return 'webm';
  return asset.type === 'video' ? 'mp4' : 'jpg';
}

export function mimeFor(asset: ImagePickerAsset) {
  if (asset.mimeType) return asset.mimeType;
  const ext = extensionFor(asset);
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  return asset.type === 'video' ? 'video/mp4' : 'image/jpeg';
}

export function mediaStoragePath(userId: string, scope: string, asset: ImagePickerAsset, index = 0) {
  const salt = Math.random().toString(36).slice(2, 10);
  return `${userId}/${scope}/${Date.now()}-${index}-${salt}.${extensionFor(asset)}`;
}

export async function uploadPickedAsset(bucket: string, path: string, asset: ImagePickerAsset) {
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('无法读取所选文件，请重新选择。');
  const body = await response.arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: mimeFor(asset),
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return path;
}
