import type { ImagePickerAsset } from 'expo-image-picker';
import { supabase } from '../auth/supabase';
import { currentUserId } from './profiles';
import { mediaStoragePath, mimeFor, PROFILE_POST_MEDIA_BUCKET, signedPostMediaUrl, uploadPickedAsset } from './media';
import type { ProfilePost, ProfilePostMedia } from './types';

const POST_SELECT = 'id,user_id,caption,status,created_at,updated_at,profile_post_media(id,post_id,owner_user_id,media_type,storage_path,mime_type,width,height,duration_ms,sort_order)';

async function withSignedUrls(rows: unknown[]) {
  return Promise.all((rows as ProfilePost[]).map(async (post) => ({
    ...post,
    profile_post_media: await Promise.all((post.profile_post_media || []).sort((a, b) => a.sort_order - b.sort_order).map(async (media) => ({ ...media, signed_url: await signedPostMediaUrl(media.storage_path) }))),
  })));
}

export async function listProfilePosts(userId: string) {
  const { data, error } = await supabase.from('profile_posts').select(POST_SELECT).eq('user_id', userId).eq('status', 'published').order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  return withSignedUrls(data || []);
}

export async function createProfilePost(caption: string, assets: ImagePickerAsset[]) {
  const userId = await currentUserId();
  if (!assets.length) throw new Error('请至少选择一张图片或一个视频。');
  if (assets.length > 4) throw new Error('每条动态最多选择 4 张图片。');
  const videos = assets.filter((asset) => asset.type === 'video');
  if (videos.length && (videos.length > 1 || assets.length > 1)) throw new Error('视频需要单独发布，每条动态最多 1 个视频。');
  for (const asset of assets) {
    const limit = asset.type === 'video' ? 80 * 1024 * 1024 : 12 * 1024 * 1024;
    if (asset.fileSize && asset.fileSize > limit) throw new Error(asset.type === 'video' ? '视频不能超过 80MB。' : '单张图片不能超过 12MB。');
  }
  const { data: post, error: postError } = await supabase.from('profile_posts').insert({ user_id: userId, caption: caption.trim(), status: 'published' }).select('id').single();
  if (postError) throw postError;
  const uploaded: string[] = [];
  try {
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      const path = mediaStoragePath(userId, post.id, asset, index);
      await uploadPickedAsset(PROFILE_POST_MEDIA_BUCKET, path, asset);
      uploaded.push(path);
      const row: Omit<ProfilePostMedia, 'id' | 'signed_url'> = {
        post_id: post.id, owner_user_id: userId, media_type: asset.type === 'video' ? 'video' : 'image', storage_path: path,
        mime_type: mimeFor(asset), width: asset.width || null, height: asset.height || null, duration_ms: asset.duration || null, sort_order: index,
      };
      const { error } = await supabase.from('profile_post_media').insert(row);
      if (error) throw error;
    }
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(PROFILE_POST_MEDIA_BUCKET).remove(uploaded).catch(() => undefined);
    await supabase.from('profile_post_media').delete().eq('post_id', post.id);
    await supabase.from('profile_posts').update({ status: 'deleted' }).eq('id', post.id);
    throw error;
  }
  return post.id as string;
}

export async function deleteProfilePost(post: ProfilePost) {
  const { error } = await supabase.from('profile_posts').update({ status: 'deleted' }).eq('id', post.id);
  if (error) throw error;
  const paths = post.profile_post_media.map((media) => media.storage_path);
  if (paths.length) await supabase.storage.from(PROFILE_POST_MEDIA_BUCKET).remove(paths).catch(() => undefined);
  await supabase.from('profile_post_media').delete().eq('post_id', post.id);
}
