import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CommentCursor, CommentRow, createComment, deleteOwnComment, likeComment, listComments, reportComment } from '../api/comments';
import { supabase } from '../auth/supabase';
import { isOwnComment } from '../community/comment-presentation';

export function CommentThread({ articleId }: { articleId: string }) {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [cursor, setCursor] = useState<CommentCursor>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [sending, setSending] = useState(false);
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<CommentRow | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async (append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const page = await listComments(articleId, append ? cursor : null);
      setItems((old) => append ? [...old, ...page.items] : page.items);
      setCursor(page.nextCursor);
    } catch (error) {
      if (!append) setItems([]);
      console.warn('comment list failed', error);
    } finally {
      append ? setLoadingMore(false) : setLoading(false);
    }
  }, [articleId, cursor]);

  useEffect(() => { void load(false); }, [articleId]);
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
    setMessage('');
    try {
      const created = await createComment(articleId, text, replyTo?.id || null);
      const wasReply = Boolean(replyTo);
      setText(''); setReplyTo(null); await load(false);
      setMessage(created.status === 'published' ? (wasReply ? '回复发布成功。' : '评论发布成功。') : '内容已提交，正在等待审核。');
    } catch (error) {
      Alert.alert('评论失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally { setSending(false); }
  };

  const onLike = async (comment: CommentRow) => {
    if (!(await requireSession())) return;
    setBusyCommentId(comment.id);
    setMessage('');
    try {
      await likeComment(comment.id);
      setMessage('点赞成功。');
    } catch (error) {
      Alert.alert('点赞失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally { setBusyCommentId(null); }
  };

  const beginReport = async (comment: CommentRow) => {
    if (!(await requireSession())) return;
    setReportTarget(comment);
    setReportReason('');
  };

  const submitReport = async () => {
    if (!reportTarget || !reportReason.trim()) return;
    setBusyCommentId(reportTarget.id);
    setMessage('');
    try {
      await reportComment(reportTarget.id, reportReason);
      setReportTarget(null); setReportReason('');
      setMessage('举报已提交，我们会在后台审核。');
    } catch (error) {
      Alert.alert('举报失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally { setBusyCommentId(null); }
  };

  const removeComment = (comment: CommentRow) => {
    Alert.alert('删除评论', '删除后评论将不再公开显示，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定删除', style: 'destructive', onPress: async () => {
        setBusyCommentId(comment.id); setMessage('');
        try {
          await deleteOwnComment(comment.id);
          if (replyTo?.id === comment.id) setReplyTo(null);
          await load(false);
          setMessage('评论已删除。');
        } catch (error) {
          Alert.alert('删除失败', error instanceof Error ? error.message : '请稍后重试。');
        } finally { setBusyCommentId(null); }
      } }
    ]);
  };

  return <View testID="news-comments" style={styles.wrap}>
    <Text style={styles.heading}>评论</Text>
    <Text style={styles.hint}>登录后可评论、回复、点赞和举报。公开列表仅展示已发布评论。</Text>
    {replyTo ? <View style={styles.replyBanner}><Text style={styles.replyText}>回复 {replyTo.profiles?.display_name || '用户'}</Text><Pressable onPress={() => setReplyTo(null)}><Text style={styles.cancel}>取消</Text></Pressable></View> : null}
    <TextInput testID="news-comment-input" value={text} onChangeText={setText} placeholder={replyTo ? '写下回复…' : '写下评论…'} multiline maxLength={3000} style={styles.input} editable={!sending} />
    <Pressable testID="news-comment-submit" style={styles.submit} onPress={submit} disabled={sending || !text.trim()}><Text style={styles.submitText}>{sending ? '发送中…' : replyTo ? '发表回复' : '发表评论'}</Text></Pressable>
    {message ? <Text testID="news-comment-message" style={styles.message}>{message}</Text> : null}

    {reportTarget ? <View style={styles.reportBox}>
      <View style={styles.replyBanner}><Text style={styles.replyText}>举报 {reportTarget.profiles?.display_name || '该用户'} 的评论</Text><Pressable onPress={() => { setReportTarget(null); setReportReason(''); }}><Text style={styles.cancel}>取消</Text></Pressable></View>
      <TextInput testID="news-comment-report-reason" value={reportReason} onChangeText={setReportReason} placeholder="请说明举报理由（1–500字）" multiline maxLength={500} style={styles.reportInput} />
      <Pressable testID="news-comment-report-submit" style={styles.reportSubmit} onPress={submitReport} disabled={!reportReason.trim() || busyCommentId === reportTarget.id}><Text style={styles.submitText}>{busyCommentId === reportTarget.id ? '提交中…' : '提交举报'}</Text></Pressable>
    </View> : null}

    {loading ? <ActivityIndicator style={{ marginTop: 24 }} /> : items.length === 0 ? <Text style={styles.empty}>暂时还没有评论。</Text> : items.map((item, index) => <View key={item.id} testID={`news-comment-${index}`} style={styles.comment}>
      <View style={styles.commentHead}><Pressable onPress={() => router.push(`/user/${item.user_id}`)}><Text style={styles.name}>{item.profiles?.display_name || '唐人读者'}</Text></Pressable><Text style={styles.time}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text></View>
      {item.parent_id ? <Text style={styles.parentTag}>回复</Text> : null}
      <Text style={styles.body}>{item.content}</Text>
      <View style={styles.actions}>
        <Pressable testID={`news-comment-reply-${index}`} onPress={() => setReplyTo(item)} disabled={busyCommentId === item.id}><Text style={styles.action}>回复</Text></Pressable>
        <Pressable testID={`news-comment-like-${index}`} onPress={() => onLike(item)} disabled={busyCommentId === item.id}><Text style={styles.action}>{busyCommentId === item.id ? '处理中…' : '点赞'}</Text></Pressable>
        <Pressable testID={`news-comment-report-${index}`} onPress={() => beginReport(item)} disabled={busyCommentId === item.id}><Text style={styles.reportAction}>举报</Text></Pressable>
        {isOwnComment(item, viewerUserId) ? <Pressable testID={`news-comment-delete-${index}`} onPress={() => removeComment(item)} disabled={busyCommentId === item.id}><Text style={styles.deleteAction}>删除</Text></Pressable> : null}
      </View>
    </View>)}

    {cursor ? <Pressable style={styles.more} onPress={() => load(true)} disabled={loadingMore}><Text style={styles.moreText}>{loadingMore ? '加载中…' : '加载更多评论'}</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap:{marginTop:38,paddingTop:26,borderTopWidth:1,borderTopColor:'#eaecf0'},heading:{fontSize:24,fontWeight:'900',color:'#101828'},hint:{color:'#667085',marginTop:6,marginBottom:14,lineHeight:20},replyBanner:{flexDirection:'row',justifyContent:'space-between',backgroundColor:'#f2f4f7',borderRadius:10,padding:10,marginBottom:8},replyText:{fontWeight:'700',color:'#344054'},cancel:{color:'#c8211e',fontWeight:'800'},input:{minHeight:88,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:12,textAlignVertical:'top',fontSize:16},submit:{backgroundColor:'#c8211e',borderRadius:10,paddingVertical:12,alignItems:'center',marginTop:10},submitText:{color:'#fff',fontWeight:'800'},message:{marginTop:12,color:'#067647',fontWeight:'700'},reportBox:{marginTop:16,padding:12,backgroundColor:'#fff7ed',borderRadius:12},reportInput:{minHeight:74,borderWidth:1,borderColor:'#d0d5dd',backgroundColor:'#fff',borderRadius:10,padding:10,textAlignVertical:'top'},reportSubmit:{backgroundColor:'#b42318',borderRadius:10,paddingVertical:11,alignItems:'center',marginTop:8},empty:{color:'#98a2b3',paddingVertical:26,textAlign:'center'},comment:{paddingVertical:18,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},commentHead:{flexDirection:'row',justifyContent:'space-between',gap:10},name:{fontWeight:'800',color:'#101828'},time:{fontSize:12,color:'#98a2b3'},parentTag:{fontSize:12,color:'#667085',marginTop:5},body:{fontSize:16,lineHeight:24,color:'#344054',marginTop:8},actions:{flexDirection:'row',flexWrap:'wrap',gap:18,marginTop:10},action:{color:'#c8211e',fontWeight:'800'},reportAction:{color:'#667085',fontWeight:'800'},deleteAction:{color:'#b42318',fontWeight:'800'},more:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingVertical:11,alignItems:'center',marginTop:14},moreText:{color:'#344054',fontWeight:'800'}
});
