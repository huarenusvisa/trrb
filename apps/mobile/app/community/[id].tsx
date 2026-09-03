import { useCallback, useEffect, useState } from 'react';
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
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try { setDetail(await getCommunityPost(String(id))); }
    catch (e) { setError(e instanceof Error ? e.message : '帖子加载失败'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const requireLogin = () => {
    if (detail?.viewerUserId) return true;
    router.push('/auth');
    return false;
  };

  const submitComment = async () => {
    if (!detail || !requireLogin()) return;
    setBusyAction('comment'); setMessage('');
    try {
      const result = await createCommunityComment(detail.post.id, comment);
      setComment('');
      setMessage(result.pending ? '评论已提交，正在等待审核。' : '评论发布成功。');
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : '评论失败'); }
    finally { setBusyAction(''); }
  };

  const like = async () => {
    if (!detail || !requireLogin()) return;
    setBusyAction('like'); setMessage('');
    try {
      const result = await toggleCommunityPostLike(detail.post.id);
      setDetail({ ...detail, post: { ...detail.post, like_count: result.like_count } });
      setMessage(result.liked ? '已点赞。' : '已取消点赞。');
    } catch (e) { setMessage(e instanceof Error ? e.message : '点赞失败'); }
    finally { setBusyAction(''); }
  };

  const submitReport = async () => {
    if (!detail || !requireLogin()) return;
    setBusyAction('report'); setMessage('');
    try {
      await reportCommunityPost(detail.post.id, reportReason);
      setReportReason(''); setShowReport(false); setMessage('举报已提交，管理员会进行审核。');
    } catch (e) { setMessage(e instanceof Error ? e.message : '举报失败'); }
    finally { setBusyAction(''); }
  };

  const removeOwnPost = () => {
    if (!detail) return;
    Alert.alert('下架帖子', '下架后帖子将不再公开显示，确定继续吗？', [
      { text: '取消', style: 'cancel' },
      { text: '确定下架', style: 'destructive', onPress: async () => {
        setBusyAction('delete'); setMessage('');
        try { await unpublishCommunityPost(detail.post.id); router.replace('/community'); }
        catch (e) { setMessage(e instanceof Error ? e.message : '下架失败'); setBusyAction(''); }
      } },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#c8211e" /><Text style={styles.muted}>正在读取帖子…</Text></View>;
  if (!detail) return <View style={styles.center}><Text style={styles.errorTitle}>暂时无法读取帖子</Text><Text style={styles.muted}>{error}</Text><Pressable style={styles.primary} onPress={() => void load()}><Text style={styles.primaryText}>重试</Text></Pressable></View>;

  const { post, comments, viewerUserId } = detail;
  const ownPost = viewerUserId === post.user_id;
  return <ScrollView testID="community-post-detail" style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ headerShown: true, title: '社区帖子', headerBackTitle: '返回' }} />
    <View style={styles.metaRow}><Text style={styles.category}>{categoryNames[post.category] || post.category}</Text>{post.status !== 'published' ? <Text style={styles.pending}>审核中</Text> : null}</View>
    <Text style={styles.title}>{post.title}</Text>
    <Text style={styles.author}>{post.profiles?.display_name || '唐人用户'} · {new Date(post.created_at).toLocaleString('zh-CN')}</Text>
    <Text style={styles.body}>{post.content}</Text>
    <View style={styles.actions}>
      <Pressable testID="community-like" disabled={Boolean(busyAction)} style={styles.action} onPress={() => void like()}><Text style={styles.actionText}>赞 {post.like_count || 0}</Text></Pressable>
      <Pressable testID="community-report" disabled={Boolean(busyAction)} style={styles.action} onPress={() => setShowReport((value) => !value)}><Text style={styles.actionText}>举报</Text></Pressable>
      {ownPost ? <Pressable testID="community-unpublish" disabled={Boolean(busyAction)} style={styles.dangerAction} onPress={removeOwnPost}><Text style={styles.dangerText}>下架帖子</Text></Pressable> : null}
    </View>
    {showReport ? <View style={styles.reportBox}><TextInput testID="community-report-reason" value={reportReason} onChangeText={setReportReason} maxLength={500} multiline placeholder="请简要说明举报理由" style={styles.reportInput} /><Pressable testID="community-report-submit" disabled={busyAction === 'report'} style={styles.reportSubmit} onPress={() => void submitReport()}><Text style={styles.primaryText}>提交举报</Text></Pressable></View> : null}
    {message ? <Text testID="community-action-message" style={styles.message}>{message}</Text> : null}
    <View style={styles.comments}>
      <Text style={styles.commentsTitle}>评论 {post.comment_count || 0}</Text>
      {comments.length ? comments.map((item) => <View key={item.id} style={styles.commentCard}>
        <View style={styles.commentHead}><Text style={styles.commentAuthor}>{item.profiles?.display_name || '唐人用户'}</Text><Text style={styles.commentTime}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text></View>
        <Text style={styles.commentBody}>{item.content}</Text>
        {item.status !== 'published' ? <Text style={styles.reviewing}>审核中，仅自己可见</Text> : null}
      </View>) : <Text style={styles.empty}>暂时还没有评论。</Text>}
      {viewerUserId ? <View style={styles.composer}><TextInput testID="community-comment-input" value={comment} onChangeText={setComment} maxLength={3000} multiline placeholder="写下你的回复" style={styles.commentInput} /><Pressable testID="community-comment-submit" disabled={busyAction === 'comment'} style={styles.primary} onPress={() => void submitComment()}>{busyAction === 'comment' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>发表评论</Text>}</Pressable></View> : <Pressable testID="community-comment-login" style={styles.primary} onPress={() => router.push('/auth')}><Text style={styles.primaryText}>登录后发表评论</Text></Pressable>}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#fff'},content:{padding:20,paddingBottom:60},center:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:12},muted:{color:'#667085',textAlign:'center'},errorTitle:{fontSize:20,fontWeight:'900',color:'#101828'},metaRow:{flexDirection:'row',alignItems:'center',gap:9},category:{color:'#c8211e',fontWeight:'900'},pending:{fontSize:12,fontWeight:'800',color:'#b54708',backgroundColor:'#fffaeb',paddingHorizontal:8,paddingVertical:4,borderRadius:999},title:{fontSize:30,lineHeight:40,fontWeight:'900',color:'#101828',marginTop:10},author:{color:'#667085',marginTop:12},body:{fontSize:17,lineHeight:29,color:'#1d2939',marginTop:24},actions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:26},action:{backgroundColor:'#f2f4f7',borderRadius:10,paddingHorizontal:15,paddingVertical:11},actionText:{fontWeight:'800',color:'#344054'},dangerAction:{borderWidth:1,borderColor:'#fda29b',borderRadius:10,paddingHorizontal:15,paddingVertical:10},dangerText:{fontWeight:'800',color:'#b42318'},message:{marginTop:14,color:'#067647',fontWeight:'700'},reportBox:{marginTop:14,backgroundColor:'#fff7ed',borderRadius:12,padding:12},reportInput:{minHeight:78,backgroundColor:'#fff',borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,padding:10,textAlignVertical:'top'},reportSubmit:{backgroundColor:'#b42318',borderRadius:10,paddingVertical:12,alignItems:'center',marginTop:9},comments:{marginTop:36,paddingTop:25,borderTopWidth:1,borderTopColor:'#eaecf0'},commentsTitle:{fontSize:23,fontWeight:'900',color:'#101828'},commentCard:{paddingVertical:16,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},commentHead:{flexDirection:'row',justifyContent:'space-between',gap:10},commentAuthor:{fontWeight:'800',color:'#101828'},commentTime:{fontSize:12,color:'#98a2b3'},commentBody:{fontSize:16,lineHeight:24,color:'#344054',marginTop:8},reviewing:{fontSize:12,color:'#b54708',marginTop:7},empty:{color:'#98a2b3',paddingVertical:24,textAlign:'center'},composer:{gap:10,marginTop:18},commentInput:{minHeight:100,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:12,textAlignVertical:'top',fontSize:16},primary:{backgroundColor:'#c8211e',borderRadius:12,paddingVertical:14,paddingHorizontal:18,alignItems:'center',marginTop:12},primaryText:{color:'#fff',fontWeight:'800'},
});
