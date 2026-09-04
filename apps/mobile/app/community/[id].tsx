import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  CommunityPostDetail,
  createCommunityComment,
  getCommunityPost,
  reportCommunityPost,
  toggleCommunityPostLike,
  unpublishCommunityComment,
  unpublishCommunityPost,
} from '../../src/api/community';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { appendCreatedCommunityComment, communityCommentDisplayName, paginateCommunityCommentThreads, removeUnpublishedCommunityComment } from '../../src/community/community-comment-presentation';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { withUiTimeout } from '../../src/utils/async-state-core';
import { clearCommentDraft, loadCommentDraft, saveCommentDraft } from '../../src/storage/commentDraft';

type ActionFeedback = { title: string; message: string; tone: 'neutral' | 'error'; retry?: () => void };
type ReplyTarget = { id: string; label: string };

const COMMENT_THREAD_PAGE_SIZE = 15;

const categoryNames: Record<string, string> = {
  hot_discussion: '热门讨论', immigration_help: '移民互助', court_experience: '上庭交流',
  uscis_interview: 'USCIS 面谈', ice_experience: 'ICE 经历', lawyer_review: '律师点评', tipoff: '投稿爆料',
};

export default function CommunityPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [comment, setComment] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [busyCommentId, setBusyCommentId] = useState('');
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [visibleThreadCount, setVisibleThreadCount] = useState(COMMENT_THREAD_PAGE_SIZE);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestComment = useRef('');
  const latestReplyTarget = useRef<ReplyTarget | null>(null);
  const commentInput = useRef<TextInput>(null);
  const requestSequence = useRef(0);

  const fetchLatest = useCallback(async (mode: 'initial' | 'refresh') => {
    if (!id) return;
    const sequence = ++requestSequence.current;
    if (mode === 'initial') { setLoading(true); setRefreshing(false); setError(''); setRefreshError(''); setDetail(null); }
    else { setRefreshing(true); setRefreshError(''); }
    try {
      const next = await withUiTimeout(getCommunityPost(String(id)), '帖子读取超时，请检查网络后重试。', 16_000);
      if (sequence !== requestSequence.current) return;
      setDetail(next); setError(''); setRefreshError('');
    } catch (e) {
      if (sequence !== requestSequence.current) return;
      const message = e instanceof Error ? e.message : '帖子加载失败';
      if (mode === 'initial') setError(message);
      else setRefreshError(message);
    } finally {
      if (sequence === requestSequence.current) {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    }
  }, [id]);

  const load = useCallback(() => fetchLatest('initial'), [fetchLatest]);
  const refresh = useCallback(() => fetchLatest('refresh'), [fetchLatest]);

  useEffect(() => { void load(); }, [load]);
  useForegroundRetry(Boolean(error || refreshError), () => { if (detail) void refresh(); else void load(); });
  useEffect(() => {
    if (!id) return;
    let active = true;
    let loaded = false;
    setDraftReady(false); setDraftRestored(false); setComment(''); setReplyTarget(null); setVisibleThreadCount(COMMENT_THREAD_PAGE_SIZE);
    latestComment.current = ''; latestReplyTarget.current = null;
    void loadCommentDraft('community', String(id)).then((draft) => {
      if (!active) return;
      loaded = true;
      if (!draft) return;
      const restoredTarget = draft.parentId ? { id: draft.parentId, label: draft.replyLabel || '用户' } : null;
      latestComment.current = draft.text; latestReplyTarget.current = restoredTarget;
      setComment(draft.text); setReplyTarget(restoredTarget); setDraftRestored(true);
    }).catch(() => undefined).finally(() => { if (active) { loaded = true; setDraftReady(true); } });
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (loaded) void saveCommentDraft('community', String(id), {
        text: latestComment.current,
        parentId: latestReplyTarget.current?.id,
        replyLabel: latestReplyTarget.current?.label,
      }).catch(() => undefined);
    };
  }, [id]);
  useEffect(() => {
    if (!id || !draftReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveCommentDraft('community', String(id), {
      text: latestComment.current,
      parentId: latestReplyTarget.current?.id,
      replyLabel: latestReplyTarget.current?.label,
    }).catch(() => undefined); }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [comment, draftReady, id, replyTarget]);

  const requireLogin = () => {
    if (detail?.viewerUserId) return true;
    router.push('/auth');
    return false;
  };

  const submitComment = async () => {
    if (!detail || !comment.trim() || busyAction === 'comment' || !requireLogin()) return;
    setBusyAction('comment'); setFeedback(null);
    try {
      const result = await withUiTimeout(createCommunityComment(detail.post.id, comment, replyTarget?.id || null), '评论提交超时，请重试。');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await clearCommentDraft('community', String(id));
      setDetail((current) => current ? appendCreatedCommunityComment(current, result.comment, result.pending) : current);
      latestComment.current = ''; latestReplyTarget.current = null;
      setComment(''); setReplyTarget(null); setDraftRestored(false);
      setFeedback({ title: result.pending ? '评论已提交' : '评论发布成功', message: result.pending ? '评论正在等待审核。' : '你的评论已显示在帖子中。', tone: 'neutral' });
      void refresh();
    } catch (e) { setFeedback({ title: '评论提交失败', message: e instanceof Error ? e.message : '评论失败', tone: 'error', retry: () => void submitComment() }); }
    finally { setBusyAction(''); }
  };

  const updateComment = (value: string) => {
    latestComment.current = value; setComment(value); setDraftRestored(false); setFeedback(null);
  };

  const startReply = (target: ReplyTarget) => {
    latestReplyTarget.current = target; setReplyTarget(target); setDraftRestored(false); setFeedback(null);
    requestAnimationFrame(() => commentInput.current?.focus());
  };

  const cancelReply = () => {
    latestReplyTarget.current = null; setReplyTarget(null); setDraftRestored(false);
  };

  const like = async () => {
    if (!detail || !requireLogin()) return;
    setBusyAction('like'); setFeedback(null);
    try {
      const result = await withUiTimeout(toggleCommunityPostLike(detail.post.id), '点赞操作超时，请重试。');
      setDetail((current) => current ? { ...current, post: { ...current.post, like_count: result.like_count, viewer_has_liked: result.liked } } : current);
      setFeedback({ title: result.liked ? '已点赞' : '已取消点赞', message: '帖子状态已更新。', tone: 'neutral' });
    } catch (e) { setFeedback({ title: '点赞操作失败', message: e instanceof Error ? e.message : '点赞失败', tone: 'error', retry: () => void like() }); }
    finally { setBusyAction(''); }
  };

  const submitReport = async () => {
    if (!detail || !requireLogin()) return;
    setBusyAction('report'); setFeedback(null);
    try {
      await withUiTimeout(reportCommunityPost(detail.post.id, reportReason), '举报提交超时，请重试。');
      setReportReason(''); setShowReport(false); setFeedback({ title: '举报已提交', message: '管理员会进行审核。', tone: 'neutral' });
    } catch (e) { setFeedback({ title: '举报提交失败', message: e instanceof Error ? e.message : '举报失败', tone: 'error', retry: () => void submitReport() }); }
    finally { setBusyAction(''); }
  };

  const removeOwnPost = () => {
    if (!detail) return;
    Alert.alert('下架帖子', '下架后帖子将不再公开显示，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定下架', style: 'destructive', onPress: async () => {
        setBusyAction('delete'); setFeedback(null);
        try { await withUiTimeout(unpublishCommunityPost(detail.post.id), '帖子下架超时，请重试。'); router.replace('/community'); }
        catch (e) { setFeedback({ title: '帖子下架失败', message: e instanceof Error ? e.message : '下架失败', tone: 'error', retry: removeOwnPost }); }
        finally { setBusyAction(''); }
      } },
    ]);
  };

  const removeOwnComment = (commentId: string, confirmed = false) => {
    if (!detail || busyCommentId) return;
    const perform = async () => {
      setBusyCommentId(commentId); setFeedback(null);
      try {
        const result = await withUiTimeout(unpublishCommunityComment(commentId), '评论下架超时，请重试。');
        setDetail((current) => current ? removeUnpublishedCommunityComment(current, result.comment_id, result.comment_count) : current);
        if (latestReplyTarget.current?.id === commentId) cancelReply();
        setFeedback({ title: '评论已下架', message: '这条评论已从公开列表移除。', tone: 'neutral' });
      } catch (e) {
        setFeedback({ title: '评论下架失败', message: e instanceof Error ? e.message : '下架失败', tone: 'error', retry: () => removeOwnComment(commentId, true) });
      } finally { setBusyCommentId(''); }
    };
    if (confirmed) { void perform(); return; }
    Alert.alert('下架评论', '下架后评论将不再公开显示，回复仍会保留。确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定下架', style: 'destructive', onPress: () => void perform() },
    ]);
  };

  if (loading) return <View style={styles.center}><AsyncStatePanel title="正在读取帖子" message="正在同步最新内容和评论…" busy /></View>;
  if (!detail) return <View style={styles.center}><AsyncStatePanel testID="community-post-error" title="暂时无法读取帖子" message={error || '帖子可能已下架或暂时不可访问。'} tone="error" actionLabel="重新读取" onAction={() => void load()} /></View>;

  const { post, comments, viewerUserId } = detail;
  const ownPost = viewerUserId === post.user_id;
  const commentPage = paginateCommunityCommentThreads(comments, visibleThreadCount);
  return <ScrollView testID="community-post-detail" style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#c8211e" colors={['#c8211e']} />}>
    <Stack.Screen options={{ headerShown: true, title: '社区帖子', headerBackTitle: '返回' }} />
    <View style={styles.metaRow}><Text style={styles.category}>{categoryNames[post.category] || post.category}</Text>{post.status !== 'published' ? <Text style={styles.pending}>审核中</Text> : null}</View>
    <Text style={styles.title}>{post.title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`查看${post.profiles?.display_name || '唐人用户'}的主页`} onPress={() => router.push(`/user/${post.user_id}`)}><Text style={styles.author}>{post.profiles?.display_name || '唐人用户'} · {new Date(post.created_at).toLocaleString('zh-CN')}</Text></Pressable>
    <Text style={styles.body}>{post.content}</Text>
    <View style={styles.actions}>
      <Pressable testID="community-like" accessibilityRole="button" accessibilityLabel={`${post.viewer_has_liked ? '取消点赞' : '点赞'}，当前${post.like_count || 0}个赞`} accessibilityState={{ disabled: Boolean(busyAction), selected: post.viewer_has_liked }} disabled={Boolean(busyAction)} style={[styles.action, post.viewer_has_liked && styles.likedAction]} onPress={() => void like()}><Text style={[styles.actionText, post.viewer_has_liked && styles.likedActionText]}>{busyAction === 'like' ? '处理中…' : `${post.viewer_has_liked ? '已赞' : '赞'} ${post.like_count || 0}`}</Text></Pressable>
      <Pressable testID="community-report" accessibilityRole="button" accessibilityLabel="举报帖子" accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.action} onPress={() => setShowReport((value) => !value)}><Text style={styles.actionText}>举报</Text></Pressable>
      {ownPost ? <Pressable testID="community-unpublish" accessibilityRole="button" accessibilityLabel="下架帖子" accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.dangerAction} onPress={removeOwnPost}><Text style={styles.dangerText}>{busyAction === 'delete' ? '处理中…' : '下架帖子'}</Text></Pressable> : null}
    </View>
    {showReport ? <View style={styles.reportBox}><TextInput testID="community-report-reason" accessibilityLabel="举报理由" value={reportReason} onChangeText={setReportReason} maxLength={500} multiline placeholder="请简要说明举报理由" style={styles.reportInput} /><Pressable testID="community-report-submit" accessibilityRole="button" accessibilityLabel="提交举报" accessibilityState={{ disabled: busyAction === 'report' }} disabled={busyAction === 'report'} style={styles.reportSubmit} onPress={() => void submitReport()}>{busyAction === 'report' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>提交举报</Text>}</Pressable></View> : null}
    {feedback ? <AsyncStatePanel testID="community-action-feedback" title={feedback.title} message={feedback.message} tone={feedback.tone} actionLabel={feedback.retry ? '重试操作' : undefined} onAction={feedback.retry} busy={Boolean(busyAction)} /> : null}
    {refreshing ? <Text testID="community-refreshing" accessibilityLiveRegion="polite" style={styles.syncStatus}>正在后台同步帖子和评论…</Text> : null}
    {refreshError ? <AsyncStatePanel testID="community-refresh-error" title="刷新失败，已保留当前内容" message={refreshError} tone="error" actionLabel="重新刷新" onAction={() => void refresh()} /> : null}
    <View style={styles.comments}>
      <Text style={styles.commentsTitle}>评论 {post.comment_count || 0}</Text>
      {commentPage.hiddenThreadCount ? <Pressable testID="community-comments-load-earlier" accessibilityRole="button" accessibilityLabel={`查看更早的${Math.min(COMMENT_THREAD_PAGE_SIZE, commentPage.hiddenThreadCount)}组评论`} style={styles.loadEarlier} onPress={() => setVisibleThreadCount((count) => count + COMMENT_THREAD_PAGE_SIZE)}><Text style={styles.loadEarlierText}>查看更早评论（还有 {commentPage.hiddenThreadCount} 组）</Text></Pressable> : null}
      {commentPage.rows.length ? commentPage.rows.map(({ item, depth, replyToLabel }) => <View key={item.id} style={[styles.commentCard, depth > 0 && styles.replyCard, { marginLeft: Math.min(depth, 3) * 14 }]}>
        <View style={styles.commentHead}><Pressable accessibilityRole="button" accessibilityLabel={`查看${item.profiles?.display_name || '唐人用户'}的主页`} onPress={() => router.push(`/user/${item.user_id}`)}><Text style={styles.commentAuthor}>{item.profiles?.display_name || '唐人用户'}</Text></Pressable><Text style={styles.commentTime}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text></View>
        {replyToLabel ? <Text style={styles.replyLabel}>回复 {replyToLabel}</Text> : null}
        <Text style={styles.commentBody}>{item.content}</Text>
        {item.status !== 'published' ? <Text style={styles.reviewing}>审核中，仅自己可见</Text> : null}
        <View style={styles.commentActions}>
          {viewerUserId && item.status === 'published' ? <Pressable testID={`community-comment-reply-${item.id}`} accessibilityRole="button" accessibilityLabel={`回复${communityCommentDisplayName(item)}`} accessibilityState={{ disabled: Boolean(busyCommentId) }} disabled={Boolean(busyCommentId)} style={styles.replyAction} onPress={() => startReply({ id: item.id, label: communityCommentDisplayName(item) })}><Text style={styles.replyActionText}>回复</Text></Pressable> : null}
          {viewerUserId === item.user_id ? <Pressable testID={`community-comment-unpublish-${item.id}`} accessibilityRole="button" accessibilityLabel="下架自己的评论" accessibilityState={{ disabled: Boolean(busyCommentId), busy: busyCommentId === item.id }} disabled={Boolean(busyCommentId)} style={styles.commentDeleteAction} onPress={() => removeOwnComment(item.id)}><Text style={styles.commentDeleteText}>{busyCommentId === item.id ? '下架中…' : '下架'}</Text></Pressable> : null}
        </View>
      </View>) : <Text style={styles.empty}>暂时还没有评论。</Text>}
      {viewerUserId ? <View style={styles.composer}>{draftRestored ? <Text testID="community-comment-draft-restored" accessibilityLiveRegion="polite" style={styles.draftNotice}>已恢复评论草稿{replyTarget ? `，将回复 ${replyTarget.label}` : ''}。</Text> : null}{replyTarget ? <View testID="community-comment-reply-target" style={styles.replyTarget}><Text style={styles.replyTargetText}>正在回复 {replyTarget.label}</Text><Pressable accessibilityRole="button" accessibilityLabel="取消回复" onPress={cancelReply}><Text style={styles.cancelReply}>取消</Text></Pressable></View> : null}<TextInput ref={commentInput} testID="community-comment-input" accessibilityLabel={replyTarget ? `回复${replyTarget.label}` : '评论内容'} value={comment} onChangeText={updateComment} editable={busyAction !== 'comment'} maxLength={3000} multiline placeholder={replyTarget ? `回复 ${replyTarget.label}` : '写下你的评论'} style={styles.commentInput} /><Text style={styles.counter}>{comment.length}/3000 · 草稿自动保存 7 天</Text><Pressable testID="community-comment-submit" accessibilityRole="button" accessibilityLabel={replyTarget ? `回复${replyTarget.label}` : '发表评论'} accessibilityState={{ disabled: busyAction === 'comment' || !comment.trim(), busy: busyAction === 'comment' }} disabled={busyAction === 'comment' || !comment.trim()} style={[styles.primary, !comment.trim() && styles.disabled]} onPress={() => void submitComment()}>{busyAction === 'comment' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{replyTarget ? '发表回复' : '发表评论'}</Text>}</Pressable></View> : <Pressable testID="community-comment-login" accessibilityRole="button" accessibilityLabel="登录后发表评论" style={styles.primary} onPress={() => router.push('/auth')}><Text style={styles.primaryText}>登录后发表评论</Text></Pressable>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingBottom:60,gap:12},center:{flex:1,justifyContent:'center',padding:28},muted:{color:'#667085',textAlign:'center'},metaRow:{flexDirection:'row',alignItems:'center',gap:9},category:{color:'#c8211e',fontWeight:'900'},pending:{fontSize:12,fontWeight:'800',color:'#b54708',backgroundColor:'#fffaeb',paddingHorizontal:8,paddingVertical:4,borderRadius:999},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},author:{color:'#667085',marginTop:12},body:{fontSize:17,lineHeight:29,color:'#1d2939',marginTop:24},actions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:26},action:{minHeight:44,backgroundColor:'#f2f4f7',borderRadius:10,paddingHorizontal:15,paddingVertical:11,justifyContent:'center'},actionText:{fontWeight:'800',color:'#344054'},likedAction:{backgroundColor:'#fef3f2'},likedActionText:{color:'#b42318'},dangerAction:{minHeight:44,borderWidth:1,borderColor:'#fda29b',borderRadius:10,paddingHorizontal:15,paddingVertical:10,justifyContent:'center'},dangerText:{fontWeight:'800',color:'#b42318'},reportBox:{marginTop:14,backgroundColor:'#fff7ed',borderRadius:12,padding:12},reportInput:{minHeight:78,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,padding:10,textAlignVertical:'top'},reportSubmit:{minHeight:44,backgroundColor:'#b42318',borderRadius:10,paddingVertical:12,alignItems:'center',justifyContent:'center',marginTop:9},syncStatus:{color:'#667085',textAlign:'center',fontWeight:'700'},comments:{marginTop:24,paddingTop:25,borderTopWidth:1,borderTopColor:'#eaecf0'},commentsTitle:{fontSize:23,fontWeight:'900',color:'#101828'},loadEarlier:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:10},loadEarlierText:{color:'#175cd3',fontWeight:'800'},commentCard:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},replyCard:{borderLeftWidth:2,borderLeftColor:'#d0d5dd',paddingLeft:12},commentHead:{flexDirection:'row',justifyContent:'space-between',gap:10},commentAuthor:{fontWeight:'800',color:'#101828'},commentTime:{fontSize:12,color:'#98a2b3'},replyLabel:{fontSize:13,color:'#667085',marginTop:7},commentBody:{fontSize:16,lineHeight:24,color:'#344054',marginTop:8},reviewing:{fontSize:12,color:'#b54708',marginTop:7},commentActions:{flexDirection:'row',alignItems:'center',gap:14,marginTop:4},replyAction:{minHeight:36,justifyContent:'center',paddingRight:18},replyActionText:{color:'#175cd3',fontWeight:'800'},commentDeleteAction:{minHeight:36,justifyContent:'center',paddingHorizontal:4},commentDeleteText:{color:'#b42318',fontWeight:'800'},empty:{color:'#98a2b3',paddingVertical:24,textAlign:'center'},composer:{gap:10,marginTop:18},draftNotice:{color:'#067647',fontWeight:'800',backgroundColor:'#ecfdf3',borderRadius:10,padding:10},replyTarget:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#eff8ff',borderRadius:10,padding:10},replyTargetText:{color:'#175cd3',fontWeight:'800'},cancelReply:{color:'#b42318',fontWeight:'800',padding:4},commentInput:{minHeight:100,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:12,textAlignVertical:'top',fontSize:16},counter:{textAlign:'right',color:'#98a2b3'},primary:{minHeight:44,backgroundColor:'#c8211e',borderRadius:12,paddingVertical:14,paddingHorizontal:18,alignItems:'center',justifyContent:'center',marginTop:12},disabled:{opacity:.45},primaryText:{color:'#fff',fontWeight:'800'},
});
