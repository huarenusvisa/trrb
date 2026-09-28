import { reviewedStoryReady, ICE_TRANSLATION_VERSION, sourceWithinCollectionWindow } from './news-editorial-policy.mjs';
import { publicEvidence } from '../netlify/shared/publication.mjs';

// A completed, content-bound editorial review is sufficient; an additional
// human approval or official-account label is not required for the same copy.
export function reviewedSourceReady(story, post, now = Date.now()) {
  const payload = story?.ai_payload || {};
  if (['editing', 'approved', 'rejected'].includes(story?.human_review_status) || story?.reviewed_by) return false;
  if (payload.editorial_lock || payload.manual_override) return false;
  if (!reviewedStoryReady(story) || payload.translation_version !== ICE_TRANSLATION_VERSION) return false;
  if (payload.translated_to_chinese !== true || payload.old_news_checked !== true ||
      payload.automatic_old_news_check_passed !== true || payload.appears_old_news === true) return false;
  if (story.conflict_detected || story.privacy_risk || story.fabrication_risk || payload.unconfirmed_claims?.length) return false;
  if (!post?.x_post_id || post.x_post_id !== payload.lead_source_post_id ||
      !post.x_url || post.x_url !== payload.lead_source_url || !post.source_text?.trim()) return false;
  if (!publicEvidence({source_url: post.x_url}).length || !sourceWithinCollectionWindow(post.source_created_at, now)) return false;
  const text = String(story.content || '').replace(/\s+/g, '');
  if (!/[\u3400-\u9fff]/u.test(story.title || '') ||
      (text.match(/[\u3400-\u9fff]/gu) || []).length / Array.from(text).length < 0.45) return false;
  let media = post.media || [];
  if (typeof media === 'string') { try { media = JSON.parse(media); } catch { return false; } }
  if ((payload.image_count > 0 || (Array.isArray(media) && media.some(item => item?.url || item?.preview_image_url))) &&
      payload.image_grounding_used !== true) return false;
  return true;
}
