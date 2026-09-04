import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  CommunityPostDetail,
  createCommunityComment,
  getCommunityPost,
  reportCommunityPost,
  toggleCommunityPostLike,
  unpublishCommunityPost,
} from '../../src/api/community';
import { AsyncStatePanel } from '../../src/components/AsyncStatePanel';
import { useForegroundRetry } from '../../src/hooks/useForegroundRetry';
import { withUiTimeout } from '../../src/utils/async-state-core';
import { clearCommentDraft, loadCommentDraft, saveCommentDraft } from '../../src/storage/commentDraft';

type ActionFeedback = { title: string; message: string; tone: 'neutral' | 'error'; retry?: () => void };

const categoryNames: Record<string, string> = {
  hot_discussion: '热门讨论', immigration_help: '移民互助', court_experience: '上庭交流',
  uscis_interview: 'USCIS 面谈', ice_experience: 'ICE 经历', lawyer_review: '律师点评', tipoff: '投稿爆料',
};

export default function CommunityPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestComment = useRef('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try { setDetail(await withUiTimeout(getCommunityPost(String(id)), '帖子读取超时，请检查网络后重试。', 16_000)); }
    catch (e) { setError(e instanceof Error ? e.message : '帖子加载失败'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useForegroundRetry(Boolean(error), () => void load());
  useEffect(() => {
    if (!id) return;
    let active = true;
    let loaded = false;
    setDraftReady(false); setDraftRestored(false); setComment(''); latestComment.current = '';
    void loadCommentDraft('community', String(id)).then((draft) => {
      if (!active) return;
      loaded = true;
      if (!draft) return;
      latestComment.current = draft.text; setComment(draft.text); setDraftRestored(true);
    }).catch(() => undefined).finally(() => { if (active) { loaded = true; setDraftReady(true); } });
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (loaded) void saveCommentDraft('community', String(id), { text: latestComment.current }).catch(() => undefined);
    };
  }, [id]);
  useEffect(() => {
    if (!id || !draftReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveCommentDraft('community', String(id), { text: latestComment.current }).catch(() => undefined); }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [comment, draftReady, id]);

  const requireLogin = () => {
    if (detail?.viewerUserId) return true;
    router.push('/auth');
    return false;
  };

  const submitComment = async () => {
    if (!detail || !comment.trim() || busyAction === 'comment' || !requireLogin()) return;
    setBusyAction('comment'); setFeedback(null);
    try {
      const result = await withUiTimeout(createCommunityComment(detail.post.id, comment), '评论提交超时，请重试。');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await clearCommentDraft('community', String(id));
      latestComment.current = ''; setComment(''); setDraftRestored(false);
      setFeedback({ title: result.pending ? '评论已提交' : '评论发布成功', message: result.pending ? '评论正在等待审核。' : '你的评论已显示在帖子中。', tone: 'neutral' });
      await load();
    } catch (e) { setFeedback({ title: '评论提交失败', message: e instanceof Error ? e.message : '评论失败', tone: 'error', retry: () => void submitComment() }); }
    finally { setBusyAction(''); }
  };

  const updateComment = (value: string) => {
    latestComment.current = value; setComment(value); setDraftRestored(false); setFeedback(null);
  };

  const like = async () => {
    if (!detail || !requireLogin()) return;
    setBusyAction('like'); setFeedback(null);
    try {
      const result = await withUiTimeout(toggleCommunityPostLike(detail.post.id), '点赞操作超时，请重试。');
      setDetail({ ...detail, post: { ...detail.post, like_count: result.like_count } });
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

  if (loading) return <View style={styles.center}><AsyncStatePanel title="正在读取帖子" message="正在同步最新内容和评论…" busy /></View>;
  if (!detail) return <View style={styles.center}><AsyncStatePanel testID="community-post-error" title="暂时无法读取帖子" message={error || '帖子可能已下架或暂时不可访问。'} tone="error" actionLabel="重新读取" onAction={() => void load()} /></View>;

  const { post, comments, viewerUserId } = detail;
  const ownPost = viewerUserId === post.user_id;
  return <ScrollView testID="community-post-detail" style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ headerShown: true, title: '社区帖子', headerBackTitle: '返回' }} />
    <View style={styles.metaRow}><Text style={styles.category}>{categoryNames[post.category] || post.category}</Text>{post.status !== 'published' ? <Text style={styles.pending}>审核中</Text> : null}</View>
    <Text style={styles.title}>{post.title}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`查看${post.profiles?.display_name || '唐人用户'}的主页`} onPress={() => router.push(`/user/${post.user_id}`)}><Text style={styles.author}>{post.profiles?.display_name || '唐人用户'} · {new Date(post.created_at).toLocaleString('zh-CN')}</Text></Pressable>
    <Text style={styles.body}>{post.content}</Text>
    <View style={styles.actions}>
      <Pressable testID="community-like" accessibilityRole="button" accessibilityLabel={`点赞，当前${post.like_count || 0}个赞`} accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.action} onPress={() => void like()}><Text style={styles.actionText}>{busyAction === 'like' ? '处理中…' : `赞 ${post.like_count || 0}`}</Text></Pressable>
      <Pressable testID="community-report" accessibilityRole="button" accessibilityLabel="举报帖子" accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.action} onPress={() => setShowReport((value) => !value)}><Text style={styles.actionText}>举报</Text></Pressable>
      {ownPost ? <Pressable testID="community-unpublish" accessibilityRole="button" accessibilityLabel="下架帖子" accessibilityState={{ disabled: Boolean(busyAction) }} disabled={Boolean(busyAction)} style={styles.dangerAction} onPress={removeOwnPost}><Text style={styles.dangerText}>{busyAction === 'delete' ? '处理中…' : '下架帖子'}</Text></Pressable> : null}
    </View>
    {showReport ? <View style={styles.reportBox}><TextInput testID="community-report-reason" accessibilityLabel="举报理由" value={reportReason} onChangeText={setReportReason} maxLength={500} multiline placeholder="请简要说明举报理由" style={styles.reportInput} /><Pressable testID="community-report-submit" accessibilityRole="button" accessibilityLabel="提交举报" accessibilityState={{ disabled: busyAction === 'report' }} disabled={busyAction === 'report'} style={styles.reportSubmit} onPress={() => void submitReport()}>{busyAction === 'report' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>提交举报</Text>}</Pressable></View> : null}
    {feedback ? <AsyncStatePanel testID="community-action-feedback" title={feedback.title} message={feedback.message} tone={feedback.tone} actionLabel={feedback.retry ? '重试操作' : undefined} onAction={feedback.retry} busy={Boolean(busyAction)} /> : null}
    <View style={styles.comments}>
      <Text style={styles.commentsTitle}>评论 {post.comment_count || 0}</Text>
      {comments.length ? comments.map((item) => <View key={item.id} style={styles.commentCard}>
        <View style={styles.commentHead}><Pressable accessibilityRole="button" accessibilityLabel={`查看${item.profiles?.display_name || '唐人用户'}的主页`} onPress={() => router.push(`/user/${item.user_id}`)}><Text style={styles.commentAuthor}>{item.profiles?.display_name || '唐人用户'}</Text></Pressable><Text style={styles.commentTime}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text></View>
        <Text style={styles.commentBody}>{item.content}</Text>
        {item.status !== 'published' ? <Text style={styles.reviewing}>审核中，仅自己可见</Text> : null}
      </View>) : <Text style={styles.empty}>暂时还没有评论。</Text>}
      {viewerUserId ? <View style={styles.composer}>{draftRestored ? <Text testID="community-comment-draft-restored" accessibilityLiveRegion="polite" style={styles.draftNotice}>已恢复评论草稿。</Text> : null}<TextInput testID="community-comment-input" accessibilityLabel="评论内容" value={comment} onChangeText={updateComment} editable={busyAction !== 'comment'} maxLength={3000} multiline placeholder="写下你的回复" style={styles.commentInput} /><Text style={styles.counter}>{comment.length}/3000 · 草稿自动保存 7 天</Text><Pressable testID="community-comment-submit" accessibilityRole="button" accessibilityLabel="发表评论" accessibilityState={{ disabled: busyAction === 'comment' || !comment.trim(), busy: busyAction === 'comment' }} disabled={busyAction === 'comment' || !comment.trim()} style={[styles.primary, !comment.trim() && styles.disabled]} onPress={() => void submitComment()}>{busyAction === 'comment' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>发表评论</Text>}</Pressable></View> : <Pressable testID="community-comment-login" accessibilityRole="button" accessibilityLabel="登录后发表评论" style={styles.primary} onPress={() => router.push('/auth')}><Text style={styles.primaryText}>登录后发表评论</Text></Pressable>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingBottom:60,gap:12},center:{flex:1,justifyContent:'center',padding:28},muted:{color:'#667085',textAlign:'center'},metaRow:{flexDirection:'row',alignItems:'center',gap:9},category:{color:'#c8211e',fontWeight:'900'},pending:{fontSize:12,fontWeight:'800',color:'#b54708',backgroundColor:'#fffaeb',paddingHorizontal:8,paddingVertical:4,borderRadius:999},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},author:{color:'#667085',marginTop:12},body:{fontSize:17,lineHeight:29,color:'#1d2939',marginTop:24},actions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:26},action:{minHeight:44,backgroundColor:'#f2f4f7',borderRadius:10,paddingHorizontal:15,paddingVertical:11,justifyContent:'center'},actionText:{fontWeight:'800',color:'#344054'},dangerAction:{minHeight:44,borderWidth:1,borderColor:'#fda29b',borderRadius:10,paddingHorizontal:15,paddingVertical:10,justifyContent:'center'},dangerText:{fontWeight:'800',color:'#b42318'},reportBox:{marginTop:14,backgroundColor:'#fff7ed',borderRadius:12,padding:12},reportInput:{minHeight:78,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,padding:10,textAlignVertical:'top'},reportSubmit:{minHeight:44,backgroundColor:'#b42318',borderRadius:10,paddingVertical:12,alignItems:'center',justifyContent:'center',marginTop:9},comments:{marginTop:24,paddingTop:25,borderTopWidth:1,borderTopColor:'#eaecf0'},commentsTitle:{fontSize:23,fontWeight:'900',color:'#101828'},commentCard:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},commentHead:{flexDirection:'row',justifyContent:'space-between',gap:10},commentAuthor:{fontWeight:'800',color:'#101828'},commentTime:{fontSize:12,color:'#98a2b3'},commentBody:{fontSize:16,lineHeight:24,color:'#344054',marginTop:8},reviewing:{fontSize:12,color:'#b54708',marginTop:7},empty:{color:'#98a2b3',paddingVertical:24,textAlign:'center'},composer:{gap:10,marginTop:18},draftNotice:{color:'#067647',fontWeight:'800',backgroundColor:'#ecfdf3',borderRadius:10,padding:10},commentInput:{minHeight:100,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:12,textAlignVertical:'top',fontSize:16},counter:{textAlign:'right',color:'#98a2b3'},primary:{minHeight:44,backgroundColor:'#c8211e',borderRadius:12,paddingVertical:14,paddingHorizontal:18,alignItems:'center',justifyContent:'center',marginTop:12},disabled:{opacity:.45},primaryText:{color:'#fff',fontWeight:'800'},
});
