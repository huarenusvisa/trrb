import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CommentCursor, CommentRow, createComment, listComments } from '../api/comments';
import { supabase } from '../auth/supabase';

export function CommentThread({ articleId }: { articleId: string }) {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [cursor, setCursor] = useState<CommentCursor>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [sending, setSending] = useState(false);

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

  const submit = async () => {
    if (!text.trim()) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      Alert.alert('需要登录', '登录后才能发表评论。', [
        { text: '取消', style: 'cancel' },
        { text: '去登录', onPress: () => router.push('/auth') }
      ]);
      return;
    }
    setSending(true);
    try {
      await createComment(articleId, text, replyTo?.id || null);
      setText('');
      setReplyTo(null);
      await load(false);
    } catch (error) {
      Alert.alert('评论失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally {
      setSending(false);
    }
  };

  return <View style={styles.wrap}>
    <Text style={styles.heading}>评论</Text>
    <Text style={styles.hint}>登录后可评论和回复。公开列表仅展示已发布评论。</Text>
    {replyTo ? <View style={styles.replyBanner}><Text style={styles.replyText}>回复 {replyTo.profiles?.display_name || '用户'}</Text><Pressable onPress={() => setReplyTo(null)}><Text style={styles.cancel}>取消</Text></Pressable></View> : null}
    <TextInput
      value={text}
      onChangeText={setText}
      placeholder={replyTo ? '写下回复…' : '写下评论…'}
      multiline
      maxLength={3000}
      style={styles.input}
      editable={!sending}
    />
    <Pressable style={styles.submit} onPress={submit} disabled={sending || !text.trim()}>
      <Text style={styles.submitText}>{sending ? '发送中…' : replyTo ? '发表回复' : '发表评论'}</Text>
    </Pressable>

    {loading ? <ActivityIndicator style={{ marginTop: 24 }} /> : items.length === 0 ? <Text style={styles.empty}>暂时还没有评论。</Text> : items.map((item) => <View key={item.id} style={styles.comment}>
      <View style={styles.commentHead}><Text style={styles.name}>{item.profiles?.display_name || '唐人读者'}</Text><Text style={styles.time}>{new Date(item.created_at).toLocaleString('zh-CN')}</Text></View>
      {item.parent_id ? <Text style={styles.parentTag}>回复</Text> : null}
      <Text style={styles.body}>{item.content}</Text>
      <Pressable onPress={() => setReplyTo(item)}><Text style={styles.replyAction}>回复</Text></Pressable>
    </View>)}

    {cursor ? <Pressable style={styles.more} onPress={() => load(true)} disabled={loadingMore}><Text style={styles.moreText}>{loadingMore ? '加载中…' : '加载更多评论'}</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap:{marginTop:38,paddingTop:26,borderTopWidth:1,borderTopColor:'#eaecf0'},
  heading:{fontSize:24,fontWeight:'900',color:'#101828'},
  hint:{color:'#667085',marginTop:6,marginBottom:14,lineHeight:20},
  replyBanner:{flexDirection:'row',justifyContent:'space-between',backgroundColor:'#f2f4f7',borderRadius:10,padding:10,marginBottom:8},
  replyText:{fontWeight:'700',color:'#344054'},cancel:{color:'#c8211e',fontWeight:'800'},
  input:{minHeight:88,borderWidth:1,borderColor:'#d0d5dd',borderRadius:12,padding:12,textAlignVertical:'top',fontSize:16},
  submit:{backgroundColor:'#c8211e',borderRadius:10,paddingVertical:12,alignItems:'center',marginTop:10},submitText:{color:'#fff',fontWeight:'800'},
  empty:{color:'#98a2b3',paddingVertical:26,textAlign:'center'},
  comment:{paddingVertical:18,borderBottomWidth:1,borderBottomColor:'#f2f4f7'},commentHead:{flexDirection:'row',justifyContent:'space-between',gap:10},name:{fontWeight:'800',color:'#101828'},time:{fontSize:12,color:'#98a2b3'},parentTag:{fontSize:12,color:'#667085',marginTop:5},body:{fontSize:16,lineHeight:24,color:'#344054',marginTop:8},replyAction:{color:'#c8211e',fontWeight:'800',marginTop:8},
  more:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingVertical:11,alignItems:'center',marginTop:14},moreText:{color:'#344054',fontWeight:'800'}
});
