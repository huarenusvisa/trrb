import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { ProfilePost } from '../social/types';
import { localeDateTag } from '../i18n/i18n-core';
import { useI18n } from '../i18n/I18nProvider';

type Props = { posts: ProfilePost[]; own?: boolean };

function PostTile({ post, own }: { post: ProfilePost; own?: boolean }) {
  const { locale } = useI18n();
  const first = post.profile_post_media?.[0];
  const open = () => router.push({ pathname: '/profile-post/[id]', params: { id: post.id, own: own ? '1' : '0' } });

  return <Pressable accessibilityRole="button" accessibilityLabel="打开动态" onPress={open} style={styles.tile}>
    {first?.media_type === 'image' && first.signed_url
      ? <Image source={{ uri: first.signed_url }} contentFit="cover" transition={120} style={styles.tileMedia} />
      : first?.media_type === 'video'
        ? <View style={[styles.tileMedia, styles.videoTile]}><Text style={styles.play}>▶</Text><Text style={styles.videoLabel}>视频</Text></View>
        : <View style={[styles.tileMedia, styles.textTile]}><Text numberOfLines={7} style={styles.textTileCopy}>{post.caption || '动态'}</Text></View>}
    {post.profile_post_media?.length > 1 ? <View style={styles.countBadge}><Text style={styles.countBadgeText}>{post.profile_post_media.length}</Text></View> : null}
    <View style={styles.tileOverlay}>
      {post.caption ? <Text numberOfLines={2} style={styles.tileCaption}>{post.caption}</Text> : null}
      {post.tags?.length ? <Text numberOfLines={1} style={styles.tileTags}>{post.tags.slice(0, 5).map((tag) => `#${tag}`).join(' ')}</Text> : null}
      <Text style={styles.tileTime}>{new Date(post.created_at).toLocaleDateString(localeDateTag(locale))}</Text>
    </View>
  </Pressable>;
}

export function ProfilePostList({ posts, own }: Props) {
  const { t } = useI18n();
  if (!posts.length) return <View style={styles.empty}><Text style={styles.emptyIcon}>▧</Text><Text style={styles.emptyTitle}>{t('userProfile.noPosts')}</Text><Text style={styles.emptyText}>{own ? t('userProfile.noOwnPostsBody') : t('userProfile.noPublicPostsBody')}</Text></View>;
  return <View style={styles.grid}>{posts.map((post) => <PostTile key={post.id} post={post} own={own} />)}</View>;
}

const styles = StyleSheet.create({
  grid:{flexDirection:'row',flexWrap:'wrap',gap:4},
  tile:{width:'32.6%',aspectRatio:.78,backgroundColor:'#111',overflow:'hidden',position:'relative'},
  tileMedia:{position:'absolute',inset:0,width:'100%',height:'100%',backgroundColor:'#e9edf2'},
  videoTile:{alignItems:'center',justifyContent:'center',backgroundColor:'#1d2939'},
  play:{fontSize:28,color:'#fff'},videoLabel:{color:'#fff',fontWeight:'900',fontSize:12,marginTop:6},
  textTile:{padding:10,justifyContent:'center',backgroundColor:'#f8fafc'},
  textTileCopy:{color:'#344054',fontSize:13,lineHeight:18,fontWeight:'700'},
  countBadge:{position:'absolute',right:7,top:7,minWidth:22,height:22,paddingHorizontal:5,borderRadius:11,backgroundColor:'rgba(0,0,0,.58)',alignItems:'center',justifyContent:'center'},
  countBadgeText:{color:'#fff',fontSize:11,fontWeight:'900'},
  tileOverlay:{position:'absolute',left:0,right:0,bottom:0,padding:8,paddingTop:26,backgroundColor:'rgba(0,0,0,.38)'},
  tileCaption:{color:'#fff',fontSize:12,lineHeight:16,fontWeight:'800'},
  tileTags:{color:'#dbeafe',fontSize:10,marginTop:3},
  tileTime:{color:'rgba(255,255,255,.78)',fontSize:9,marginTop:4},
  empty:{backgroundColor:'#fff',borderRadius:16,padding:30,alignItems:'center',borderWidth:1,borderColor:'#eaecf0'},
  emptyIcon:{fontSize:28,color:'#98a2b3'},emptyTitle:{fontSize:17,fontWeight:'900',color:'#344054',marginTop:8},emptyText:{color:'#98a2b3',marginTop:5,textAlign:'center'}
});