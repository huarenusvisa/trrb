import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CommentCursor, CommentRow, createComment, deleteOwnComment, likeComment, listComments, reportComment } from '../api/comments';
import { supabase } from '../auth/supabase';
import { isOwnComment } from '../community/comment-presentation';
import { AsyncStatePanel } from './AsyncStatePanel';
import { clearCommentDraft, loadCommentDraft, saveCommentDraft } from '../storage/commentDraft';
import { useForegroundRetry } from '../hooks/useForegroundRetry';
import { withUiTimeout } from '../utils/async-state-core';

type ReplyTarget = { id: string; label: string };
type CommentActionKind = 'like' | 'report' | 'delete';
type CommentActionFailure = { kind: CommentActionKind; commentId: string; detail: string };
type BusyCommentAction = { kind: CommentActionKind; commentId: string };

export function CommentThread({ articleId }: { articleId: string }) {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [cursor, setCursor] = useState<CommentCursor>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyCommentAction | null>(null);
  const [reportTarget, setReportTarget] = useState<CommentRow | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [actionFailure, setActionFailure] = useState<CommentActionFailure | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadVersion = useRef(0);
  const latestDraft = useRef<{ text: string; parentId: string | null; replyLabel: string | null }>({ text: '', parentId: null, replyLabel: null });

  const load = useCallback(async (append = false) => {
    const version = ++loadVersion.current;
    append ? setLoadingMore(true) : setLoading(true);
    append ? setLoadMoreError('') : setLoadError('');
    try {
      const page = await withUiTimeout(listComments(articleId, append ? cursor : null), append ? '更多评论加载超时，请重试。' : '评论加载超时，请检查网络后重试。');
      if (version !== loadVersion.current) return;
      setItems((old) => append ? [...old, ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch (error) {
      if (version !== loadVersion.current) return;
      const detail = error instanceof Error ? error.message : '评论暂时无法加载。';
      append ? setLoadMoreError(detail) : setLoadError(detail);
    } finally {
      if (version !== loadVersion.current) return;
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [articleId, cursor]);

  useEffect(() => {
    loadVersion.current += 1;
    setItems([]); setCursor(null); setLoadError(''); setLoadMoreError(''); setActionFailure(null);
    void load(false);
  }, [articleId]);
  useForegroundRetry(Boolean(loadError), () => void load(false));
  useEffect(() => {
    let active = true;
    let loaded = false;
    setDraftReady(false); setDraftRestored(false); setText(''); setReplyTo(null);
    latestDraft.current = { text: '', parentId: null, replyLabel: null };
    void loadCommentDraft('news', articleId).then((draft) => {
      if (!active) return;
      loaded = true;
      if (!draft) return;
      const nextReply = draft.parentId ? { id: draft.parentId, label: draft.replyLabel || '用户' } : null;
      latestDraft.current = { text: draft.text, parentId: draft.parentId, replyLabel: draft.replyLabel };
      setText(draft.text); setReplyTo(nextReply); setDraftRestored(true);
    }).catch(() => undefined).finally(() => { if (active) { loaded = true; setDraftReady(true); } });
    return () => {
      active = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (loaded) void saveCommentDraft('news', articleId, latestDraft.current).catch(() => undefined);
    };
  }, [articleId]);
  useEffect(() => {
    if (!draftReady) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveCommentDraft('news', articleId, latestDraft.current).catch(() => undefined); }, 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [articleId, draftReady, replyTo, text]);
  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setViewerUserId(data.session?.user.id || null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setViewerUserId(session?.user.id || null));
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const requireSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    Alert.alert('需要登录', '登录后才能使用社区互动功能。', [
      { text: '取消', style: 'cancel' },
      { text: '去登录', onPress: () => router.push('/auth') }
    ]);
    return false;
  };

  const submit = async () => {
    if (!text.trim()) return;
    if (!(await requireSession())) return;
    setSending(true);
    setMessage(''); setFailure('');
    try {
      const created = await createComment(articleId, text, replyTo?.id || null);
      const wasReply = Boolean(replyTo);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await clearCommentDraft('news', articleId);
      latestDraft.current = { text: '', parentId: null, replyLabel: null };
      setText(''); setReplyTo(null); setDraftRestored(false); await load(false);
      setMessage(created.status === 'published' ? (wasReply ? '回复发布成功。' : '评论发布成功。') : '内容已提交，正在等待审核。');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : '请稍后重试。');
    } finally { setSending(false); }
  };

  const updateText = (value: string) => {
    latestDraft.current = { ...latestDraft.current, text: value };
    setText(value); setDraftRestored(false); setFailure(''); setMessage('');
  };

  const updateReply = (target: ReplyTarget | null) => {
    latestDraft.current = { ...latestDraft.current, parentId: target?.id || null, replyLabel: target?.label || null };
    setReplyTo(target); setDraftRestored(false); setFailure(''); setMessage('');
  };

  const onLike = async (comment: CommentRow) => {
    if (!(await requireSession())) return;
    setBusyAction({ kind: 'like', commentId: comment.id });
    setMessage(''); setActionFailure(null);
    try {
      await withUiTimeout(likeComment(comment.id), '点赞操作超时，请检查网络后重试。');
      setMessage('点赞成功。');
    } catch (error) {
      setActionFailure({ kind: 'like', commentId: comment.id, detail: error instanceof Error ? error.message : '点赞失败，请稍后重试。' });
    } finally { setBusyAction(null); }
  };

  const beginReport = async (comment: CommentRow) => {
    if (!(await requireSession())) return;
    setReportTarget(comment);
    setReportReason('');
    setActionFailure(null);
  };

  const submitReport = async () => {
    if (!reportTarget || !reportReason.trim()) return;
    setBusyAction({ kind: 'report', commentId: reportTarget.id });
    setMessage(''); setActionFailure(null);
    try {
      await withUiTimeout(reportComment(reportTarget.id, reportReason), '举报提交超时，请检查网络后重试。');
      setReportTarget(null); setReportReason('');
      setMessage('举报已提交，我们会在后台审核。');
    } catch (error) {
      setActionFailure({ kind: 'report', commentId: reportTarget.id, detail: error instanceof Error ? error.message : '举报失败，请稍后重试。' });
    } finally { setBusyAction(null); }
  };

  const updateReportReason = (value: string) => {
    setReportReason(value);
    if (actionFailure?.kind === 'report') setActionFailure(null);
  };

  const deleteComment = async (comment: CommentRow) => {
    setBusyAction({ kind: 'delete', commentId: comment.id }); setMessage(''); setActionFailure(null);
    try {
      await withUiTimeout(deleteOwnComment(comment.id), '删除操作超时，请检查网络后重试。');
      if (replyTo?.id === comment.id) updateReply(null);
      setItems((current) => current.filter((item) => item.id !== comment.id));
      setMessage('评论已删除。');
    } catch (error) {
      setActionFailure({ kind: 'delete', commentId: comment.id, detail: error instanceof Error ? error.message : '删除失败，请稍后重试。' });
    } finally { setBusyAction(null); }
  };

  const removeComment = (comment: CommentRow) => {
    Alert.alert('删除评论', '删除后评论将不再公开显示，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定删除', style: 'destructive', onPress: () => void deleteComment(comment) }
    ]);
  };

  return <View testID="news-comments" style={styles.wrap}>
    <Text style={styles.heading}>评论</Text>
    <Text style={styles.hint}>登录后可评论、回复、点赞和举报。公开列表仅展示已发布评论。</Text>
    {draftRestored ? <Text testID="news-comment-draft-restored" accessibilityLiveRegion="polite" style={styles.draftNotice}>{replyTo ? `已恢复回复 ${replyTo.label} 的草稿。` : '已恢复评论草稿。'}</Text> : null}
    {replyTo ? <View style={styles.replyBanner}><Text style={styles.replyText}>回复 {replyTo.label}</Text><Pressable accessibilityRole="button" accessibilityLabel="取消回复" onPress={() => updateReply(null)}><Text style={styles.cancel}>取消</Text></Pressable></View> : null}
    <TextInput testID="news-comment-input" accessibilityLabel={replyTo ? `回复${replyTo.label}` : '新闻评论内容'} value={text} onChangeText={updateText} placeholder={replyTo ? '写下回复…' : '写下评论…'} multiline maxLength={3000} style={styles.input} editable={!sending} />
    <Text style={styles.counter}>{text.length}/3000 · 草稿自动保存 7 天</Text>
    <Pressable testID="news-comment-submit" accessibilityRole="button" accessibilityLabel={replyTo ? '发表回复' : '发表评论'} accessibilityState={{ disabled: sending || !text.trim(), busy: sending }} style={styles.submit} onPress={submit} disabled={sending || !text.trim()}><Text style={styles.submitText}>{sending ? '发送中…' : replyTo ? '发表回复' : '发表评论'}</Text></Pressable>
    {failure ? <AsyncStatePanel testID="news-comment-error" title="评论尚未发布" message={`${failure} 输入内容仍保留在本页。`} tone="error" actionLabel="重试发布" onAction={() => void submit()} busy={sending} /> : null}
    {message ? <Text testID="news-comment-message" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}

    {reportTarget ? <View style={styles.reportBox}>
      <View style={styles.replyBanner}><Text style={styles.replyText}>举报 {reportTarget.profiles?.display_name || '该用户'} 的评论</Text><Pressable accessibilityRole="button" accessibilityLabel="取消举报" onPress={() => { setReportTarget(null); setReportReason(''); setActionFailure(null); }}><Text style={styles.cancel}>取消</Text></Pressable></View>
      <TextInput testID="news-comment-report-reason" accessibilityLabel="举报理由" value={reportReason} onChangeText={updateReportReason} placeholder="请说明举报理由（1–500字）" multiline maxLength={500} style={styles.reportInput} />
      <Pressable testID="news-comment-report-submit" accessibilityRole="button" accessibilityLabel="提交举报" accessibilityState={{ disabled: !reportReason.trim() || Boolean(busyAction), busy: busyAction?.kind === 'report' }} style={styles.reportSubmit} onPress={submitReport} disabled={!reportReason.trim() || Boolean(busyAction)}><Text style={styles.submitText}>{busyAction?.kind === 'report' ? '提交中…' : '提交举报'}</Text></Pressable>
      {actionFailure?.kind === 'report' && actionFailure.commentId === reportTarget.id ? <AsyncStatePanel testID="news-comment-report-error" title="举报尚未提交" message={`${actionFailure.detail} 举报理由仍保留在本页。`} tone="error" actionLabel="重试提交举报" onAction={() => void submitReport()} busy={busyAction?.kind === 'report'} /> : null}
    </View> : null}

    {loading && !items.length ? <View testID="news-comments-loading" accessibilityLiveRegion="polite"><ActivityIndicator style={{ marginTop: 24 }} /><Text style={styles.loadingText}>正在读取评论…</Text></View> : null}
    {loading && items.length ? <Text testID="news-comments-refreshing" accessibilityLiveRegion="polite" style={styles.loadingText}>正在刷新评论，已加载内容继续保留。</Text> : null}
    {loadError ? <AsyncStatePanel testID="news-comments-load-error" title={items.length ? '评论刷新失败' : '暂时无法读取评论'} message={items.length ? `${loadError} 已加载的评论仍保留在本页。` : loadError} tone="error" actionLabel="重新读取评论" onAction={() => void load(false)} busy={loading} /> : null}
    {!loading && !loadError && items.length === 0 ? <Text testID="news-comments-empty" style={styles.empty}>暂时还没有评论。</Text> : items.map((item, index) => <View key={item.id} testID={`news-comment-${index}`} style={styles.comment}>
      <View style={styles.commentHead}><Pressable onPress={() => router.push(`/user/${item.user_id}`)}><Text style={styles.name}>{item.profiles?.display_name || '唐人读者'}</Text></Pressable><Text style={styles.time}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text></View>
      {item.parent_id ? <Text style={styles.parentTag}>回复</Text> : null}
      <Text style={styles.body}>{item.content}</Text>
      <View style={styles.actions}>
        <Pressable testID={`news-comment-reply-${index}`} accessibilityRole="button" accessibilityLabel={`回复${item.profiles?.display_name || '用户'}`} accessibilityState={{ disabled: Boolean(busyAction) }} onPress={() => updateReply({ id: item.id, label: item.profiles?.display_name || '用户' })} disabled={Boolean(busyAction)}><Text style={styles.action}>回复</Text></Pressable>
        <Pressable testID={`news-comment-like-${index}`} accessibilityRole="button" accessibilityLabel="点赞评论" accessibilityState={{ disabled: Boolean(busyAction), busy: busyAction?.kind === 'like' && busyAction.commentId === item.id }} onPress={() => onLike(item)} disabled={Boolean(busyAction)}><Text style={styles.action}>{busyAction?.kind === 'like' && busyAction.commentId === item.id ? '处理中…' : '点赞'}</Text></Pressable>
        <Pressable testID={`news-comment-report-${index}`} accessibilityRole="button" accessibilityLabel="举报评论" accessibilityState={{ disabled: Boolean(busyAction) }} onPress={() => beginReport(item)} disabled={Boolean(busyAction)}><Text style={styles.reportAction}>举报</Text></Pressable>
        {isOwnComment(item, viewerUserId) ? <Pressable testID={`news-comment-delete-${index}`} accessibilityRole="button" accessibilityLabel="删除评论" accessibilityState={{ disabled: Boolean(busyAction), busy: busyAction?.kind === 'delete' && busyAction.commentId === item.id }} onPress={() => removeComment(item)} disabled={Boolean(busyAction)}><Text style={styles.deleteAction}>{busyAction?.kind === 'delete' && busyAction.commentId === item.id ? '删除中…' : '删除'}</Text></Pressable> : null}
      </View>
      {actionFailure?.commentId === item.id && actionFailure.kind !== 'report' ? <AsyncStatePanel testID={actionFailure.kind === 'like' ? 'news-comment-like-error' : 'news-comment-delete-error'} title={actionFailure.kind === 'like' ? '点赞尚未完成' : '评论尚未删除'} message={actionFailure.detail} tone="error" actionLabel={actionFailure.kind === 'like' ? '重试点赞' : '重试删除'} onAction={actionFailure.kind === 'like' ? () => void onLike(item) : () => void deleteComment(item)} busy={busyAction?.commentId === item.id} /> : null}
    </View>)}

    {loadMoreError ? <AsyncStatePanel testID="news-comments-more-error" title="更多评论加载失败" message={loadMoreError} tone="error" actionLabel="重试加载更多" onAction={() => void load(true)} busy={loadingMore} /> : null}
    {cursor && !loadMoreError ? <Pressable accessibilityRole="button" accessibilityLabel="加载更多评论" accessibilityState={{ disabled: loadingMore, busy: loadingMore }} style={styles.more} onPress={() => load(true)} disabled={loadingMore}><Text style={styles.moreText}>{loadingMore ? '加载中…' : '加载更多评论'}</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap:{marginTop:38,paddingTop:26,borderTopWidth:1,borderTopColor:'#eaecf0'},heading:{fontSize:24,fontWeight:'900',color:'#101828'},hint:{color:'#667085',marginTop:6,marginBottom:14,lineHeight:20},draftNotice:{color:'#067647',fontWeight:'800',backgroundColor:'#ecfdf3',borderRadius:10,padding:10,marginBottom:9},replyBanner:{flexDirection:'row',justifyContent:'space-between',backgroundColor:'#f2f4f7',borderRadius:10,padding:10,marginBottom:8},replyText:{fontWeight:'700',color:'#344054'},cancel:{color:'#c8211e',fontWeight:'800'},input:{minHeight:88,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:12,textAlignVertical:'top',fontSize:16},counter:{textAlign:'right',color:'#98a2b3',marginTop:5},submit:{backgroundColor:'#c8211e',borderRadius:10,paddingVertical:12,alignItems:'center',marginTop:10},submitText:{color:'#fff',fontWeight:'800'},message:{marginTop:12,color:'#067647',fontWeight:'700'},reportBox:{marginTop:16,padding:12,backgroundColor:'#fff7ed',borderRadius:12},reportInput:{minHeight:74,borderWidth:1,borderColor:'#d0d5dd',backgroundColor:'#fff',borderRadius:10,padding:10,textAlignVertical:'top'},reportSubmit:{backgroundColor:'#b42318',borderRadius:10,paddingVertical:11,alignItems:'center',marginTop:8},loadingText:{color:'#667085',textAlign:'center',marginTop:8},empty:{color:'#98a2b3',paddingVertical:26,textAlign:'center'},comment:{paddingVertical:18,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},commentHead:{flexDirection:'row',justifyContent:'space-between',gap:10},name:{fontWeight:'800',color:'#101828'},time:{fontSize:12,color:'#98a2b3'},parentTag:{fontSize:12,color:'#667085',marginTop:5},body:{fontSize:16,lineHeight:24,color:'#344054',marginTop:8},actions:{flexDirection:'row',flexWrap:'wrap',gap:18,marginTop:10},action:{color:'#c8211e',fontWeight:'800'},reportAction:{color:'#667085',fontWeight:'800'},deleteAction:{color:'#b42318',fontWeight:'800'},more:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingVertical:11,alignItems:'center',marginTop:14},moreText:{color:'#344054',fontWeight:'800'}
});
