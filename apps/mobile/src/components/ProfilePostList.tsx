import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ProfilePost, ProfilePostMedia } from '../social/types';

function VideoMedia({ media }: { media: ProfilePostMedia }) {
  const player = useVideoPlayer(media.signed_url || null);
  return <VideoView player={player} nativeControls contentFit="cover" style={styles.video} />;
}

function Media({ media, multiple }: { media: ProfilePostMedia; multiple: boolean }) {
  if (media.media_type === 'video') return <VideoMedia media={media} />;
  return <Image source={{ uri: media.signed_url }} contentFit="cover" transition={150} style={multiple ? styles.multiImage : styles.image} />;
}

type Props = { posts: ProfilePost[]; own?: boolean; onDelete?: (post: ProfilePost) => Promise<void> };

export function ProfilePostList({ posts, own, onDelete }: Props) {
  if (!posts.length) return <View style={styles.empty}><Text style={styles.emptyIcon}>▧</Text><Text style={styles.emptyTitle}>还没有主页动态</Text><Text style={styles.emptyText}>{own ? '发布图片或视频，记录自己的生活。' : '这里暂时没有公开内容。'}</Text></View>;
  return <View style={styles.list}>{posts.map((post) => <View key={post.id} style={styles.card}>
    <View style={styles.cardHead}><Text style={styles.time}>{new Date(post.created_at).toLocaleString('zh-CN')}</Text>{own && onDelete ? <Pressable onPress={() => Alert.alert('删除这条动态？', '图片或视频也会一并删除。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => void onDelete(post) }])}><Text style={styles.delete}>删除</Text></Pressable> : null}</View>
    {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
    <View style={post.profile_post_media.length > 1 ? styles.mediaGrid : styles.mediaSingle}>{post.profile_post_media.map((media) => <Media key={media.id} media={media} multiple={post.profile_post_media.length > 1} />)}</View>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  list:{gap:12},card:{backgroundColor:'#fff',borderRadius:16,padding:14,borderWidth:1,borderColor:'#eaecf0'},cardHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},time:{fontSize:12,color:'#98a2b3'},delete:{color:'#b42318',fontWeight:'800'},caption:{color:'#1d2939',fontSize:16,lineHeight:23,marginTop:9,marginBottom:10},mediaSingle:{borderRadius:13,overflow:'hidden',marginTop:10},mediaGrid:{flexDirection:'row',flexWrap:'wrap',gap:4,marginTop:10},image:{width:'100%',aspectRatio:1.25,backgroundColor:'#f2f4f7'},video:{width:'100%',aspectRatio:16/10,backgroundColor:'#000'},multiImage:{width:'49%',aspectRatio:1,backgroundColor:'#f2f4f7'},empty:{backgroundColor:'#fff',borderRadius:16,padding:30,alignItems:'center',borderWidth:1,borderColor:'#eaecf0'},emptyIcon:{fontSize:28,color:'#98a2b3'},emptyTitle:{fontSize:17,fontWeight:'900',color:'#344054',marginTop:8},emptyText:{color:'#98a2b3',marginTop:5,textAlign:'center'}
});
