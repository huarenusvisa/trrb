import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/auth/supabase';
import {
  createProfilePostComment,
  deleteProfilePost,
  deleteProfilePostComment,
  getProfilePost,
  listProfilePostComments,
  normalizeProfilePostTags,
  updateProfilePost,
} from '../../src/social/posts';
import type { ProfilePost, ProfilePostComment, ProfilePostMedia } from '../../src/social/types';

function VideoMedia({ media }: { media: ProfilePostMedia }) {
  const player = useVideoPlayer(media.signed_url || null);
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.video} />;
}

export default function ProfilePostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id || '');
  const [post, setPost] = useState<ProfilePost | null>(null);
  const [comments, setComments] = useState<ProfilePostComment[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: auth }, nextPost, nextComments] = await Promise.all([
        supabase.auth.getUser(),
        getProfilePost(postId),
        listProfilePostComments(postId),
      ]);
      setMe(auth.user?.id || null);
      setPost(nextPost);
      setCaption(nextPost.caption || '');
      setTagsText((nextPost.tags || []).join(' '));
      setComments(nextComments as ProfilePostComment[]);
    } catch (error) {
      Alert.alert('无法读取动态', error instanceof Error ? error.message : '请稍后重试');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => { if (postId) void load(); }, [load, postId]);

  const save = async () => {
    if (!post || busy) return;
    setBusy(true);
    try {
      const manualTags = tagsText.split(/[，,\s#]+/).map((tag) => tag.trim()).filter(Boolean);
      const tags = normalizeProfilePostTags(caption, manualTags);
      await updateProfilePost(post.id, caption, tags);
      setEditing(false);
      await load();
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!post || busy) return;
    Alert.alert('删除这条动态？', '删除后将不再显示。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await deleteProfilePost(post); router.back(); }
        catch (error) { Alert.alert('删除失败', error instanceof Error ? error.message : '请稍后重试'); }
        finally { setBusy(false); }
      } },
    ]);
  };

  const submitComment = async () => {
    if (!post || busy) return;
    if (!me) return Alert.alert('请先登录', '登录后可以发表评论。');
    if (!commentText.trim()) return;
    setBusy(true);
    try {
      await createProfilePostComment(post.id, commentText.trim());
      setCommentText('');
      await load();
    } catch (error) {
      Alert.alert('评论失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const removeComment = (comment: ProfilePostComment) => {
    if (comment.user_id !== me || busy) return;
    Alert.alert('删除这条评论？', '', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await deleteProfilePostComment(comment.id); await load(); }
        catch (error) { Alert.alert('删除失败', error instanceof Error ? error.message : '请稍后重试'); }
        finally { setBusy(false); }
      } },
    ]);
  };

  if (loading || !post) return <View style={styles.center}><Text style={styles.muted}>正在读取动态…</Text></View>;
  const own = me === post.user_id;

  return <><Stack.Screen options={{ headerShown: true, title: '动态详情', headerBackTitle: '返回' }} />
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Text style={styles.time}>{new Date(post.created_at).toLocaleString()}</Text>
        {own ? <View style={styles.actions}>
          <Pressable disabled={busy} onPress={() => setEditing((value) => !value)}><Text style={styles.edit}>{editing ? '取消编辑' : '编辑'}</Text></Pressable>
          <Pressable disabled={busy} onPress={remove}><Text style={styles.delete}>删除</Text></Pressable>
        </View> : null}
      </View>

      {post.profile_post_media?.length ? <View style={styles.mediaWrap}>
        {post.profile_post_media.map((media) => media.media_type === 'video'
          ? <VideoMedia key={media.id} media={media} />
          : <Image key={media.id} source={{ uri: media.signed_url }} contentFit="contain" style={styles.image} />)}
      </View> : null}

      {editing ? <View style={styles.editor}>
        <Text style={styles.label}>文字内容</Text>
        <TextInput value={caption} onChangeText={setCaption} maxLength={2000} multiline textAlignVertical="top" style={styles.input} />
        <Text style={styles.label}>标签</Text>
        <TextInput value={tagsText} onChangeText={setTagsText} maxLength={220} placeholder="最多5个，用空格、逗号或#分隔" style={styles.tagsInput} />
        <Text style={styles.helper}>正文里的 #标签 也会自动识别；最终最多保留 5 个标签。</Text>
        <Pressable disabled={busy} onPress={() => void save()} style={styles.save}><Text style={styles.saveText}>{busy ? '保存中…' : '保存修改'}</Text></Pressable>
      </View> : <>
        {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
        {post.tags?.length ? <View style={styles.tags}>{post.tags.slice(0,5).map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}</View> : null}
      </>}

      <View style={styles.commentSection}>
        <View style={styles.commentHead}><Text style={styles.commentTitle}>评论</Text><Text style={styles.commentCount}>{comments.length}</Text></View>
        {me ? <View style={styles.commentComposer}>
          <TextInput value={commentText} onChangeText={setCommentText} maxLength={3000} multiline placeholder="写下你的评论…" style={styles.commentInput} />
          <Pressable disabled={busy || !commentText.trim()} onPress={() => void submitComment()} style={[styles.commentButton, (!commentText.trim() || busy) && styles.disabled]}><Text style={styles.commentButtonText}>发表评论</Text></Pressable>
        </View> : <Text style={styles.loginHint}>登录后可以发表评论。</Text>}

        <View style={styles.commentList}>
          {comments.length ? comments.map((comment) => <View key={comment.id} style={styles.commentCard}>
            <View style={styles.commentTop}>
              <Text style={styles.commentAuthor}>{comment.profiles?.display_name || '唐人用户'}</Text>
              <Text style={styles.commentTime}>{new Date(comment.created_at).toLocaleString()}</Text>
            </View>
            <Text style={styles.commentBody}>{comment.content}</Text>
            {comment.user_id === me ? <Pressable onPress={() => removeComment(comment)}><Text style={styles.commentDelete}>删除评论</Text></Pressable> : null}
          </View>) : <Text style={styles.noComments}>暂无评论，来做第一个评论的人。</Text>}
        </View>
      </View>
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f6f8'},content:{padding:14,paddingBottom:60,gap:14},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f5f6f8'},muted:{color:'#98a2b3'},
  topRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},time:{fontSize:12,color:'#98a2b3'},actions:{flexDirection:'row',gap:16},edit:{color:'#175cd3',fontWeight:'900'},delete:{color:'#b42318',fontWeight:'900'},
  mediaWrap:{gap:8,backgroundColor:'#fff',borderRadius:14,overflow:'hidden'},image:{width:'100%',aspectRatio:1.05,backgroundColor:'#eef2f6'},video:{width:'100%',aspectRatio:16/10,backgroundColor:'#000'},
  caption:{backgroundColor:'#fff',borderRadius:14,padding:15,fontSize:17,lineHeight:26,color:'#1d2939'},tags:{flexDirection:'row',flexWrap:'wrap',gap:7},tag:{color:'#175cd3',fontWeight:'900'},
  editor:{backgroundColor:'#fff',borderRadius:14,padding:14,gap:8},label:{fontWeight:'900',color:'#344054'},input:{minHeight:150,borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,padding:12,fontSize:16,color:'#101828'},tagsInput:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,padding:12,fontSize:16,color:'#101828'},helper:{fontSize:12,lineHeight:18,color:'#667085'},save:{backgroundColor:'#c8211e',borderRadius:10,padding:13,alignItems:'center'},saveText:{color:'#fff',fontWeight:'900'},
  commentSection:{backgroundColor:'#fff',borderRadius:16,padding:14},commentHead:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:12},commentTitle:{fontSize:20,fontWeight:'900',color:'#101828'},commentCount:{color:'#98a2b3',fontWeight:'800'},
  commentComposer:{gap:8},commentInput:{minHeight:90,borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,padding:11,textAlignVertical:'top'},commentButton:{alignSelf:'flex-end',backgroundColor:'#c8211e',borderRadius:9,paddingVertical:10,paddingHorizontal:16},commentButtonText:{color:'#fff',fontWeight:'900'},disabled:{opacity:.4},loginHint:{color:'#667085',paddingVertical:8},
  commentList:{gap:10,marginTop:14},commentCard:{backgroundColor:'#f8fafc',borderRadius:10,padding:11},commentTop:{flexDirection:'row',justifyContent:'space-between',gap:10},commentAuthor:{fontWeight:'900',color:'#344054'},commentTime:{fontSize:11,color:'#98a2b3'},commentBody:{marginTop:7,color:'#344054',lineHeight:21},commentDelete:{marginTop:7,color:'#b42318',fontSize:12,fontWeight:'800'},noComments:{color:'#98a2b3',textAlign:'center',paddingVertical:20}
});