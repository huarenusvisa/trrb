import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TrRbAvatar } from './TrRbAvatar';
import { publicProfileMediaUrl } from '../social/media';
import type { SocialProfile } from '../social/types';

type Props = {
  profile: SocialProfile;
  followers: number;
  following: number;
  own?: boolean;
  onEdit?: () => void;
  onFollowers?: () => void;
  onFollowing?: () => void;
  actions?: React.ReactNode;
};

export function ProfileHero({ profile, followers, following, own, onEdit, onFollowers, onFollowing, actions }: Props) {
  const cover = publicProfileMediaUrl(profile.cover_path);
  return <View style={styles.card}>
    <View style={styles.cover}>
      {cover ? <Image source={{ uri: cover }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : <View style={styles.coverFallback}><View style={styles.glowOne} /><View style={styles.glowTwo} /></View>}
    </View>
    <View style={styles.body}>
      <View style={styles.avatarWrap}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={88} label={`${profile.display_name || '唐人读者'}的头像`} /></View>
      <View style={styles.nameRow}>
        <View style={styles.nameCopy}><Text style={styles.name}>{profile.display_name || '唐人读者'}</Text><Text style={styles.privacy}>{profile.is_private ? '🔒 隐私账号' : '公开账号'}</Text></View>
        {own && onEdit ? <Pressable style={styles.edit} onPress={onEdit}><Text style={styles.editText}>编辑主页</Text></Pressable> : null}
      </View>
      <Text style={styles.bio}>{profile.bio?.trim() || '这个人很低调，还没有填写简介。'}</Text>
      <View style={styles.stats}>
        <Pressable style={styles.stat} onPress={onFollowing}><Text style={styles.statNumber}>{following}</Text><Text style={styles.statLabel}>关注</Text></Pressable>
        <Pressable style={styles.stat} onPress={onFollowers}><Text style={styles.statNumber}>{followers}</Text><Text style={styles.statLabel}>粉丝</Text></Pressable>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card:{backgroundColor:'#fff',borderRadius:22,overflow:'hidden',borderWidth:1,borderColor:'#e4e7ec'},cover:{height:154,backgroundColor:'#dbeafe'},coverFallback:{flex:1,backgroundColor:'#0f4c81',overflow:'hidden'},glowOne:{position:'absolute',width:240,height:240,borderRadius:120,backgroundColor:'#5dd6dd',opacity:.38,right:-55,top:-100},glowTwo:{position:'absolute',width:220,height:220,borderRadius:110,backgroundColor:'#8b5cf6',opacity:.28,left:-70,bottom:-130},body:{paddingHorizontal:18,paddingBottom:18},avatarWrap:{width:98,height:98,borderRadius:49,backgroundColor:'#fff',padding:5,marginTop:-49},nameRow:{flexDirection:'row',alignItems:'center',gap:12,marginTop:10},nameCopy:{flex:1},name:{fontSize:25,fontWeight:'900',color:'#101828'},privacy:{fontSize:12,color:'#667085',marginTop:4,fontWeight:'700'},edit:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingHorizontal:14,paddingVertical:10},editText:{fontWeight:'800',color:'#344054'},bio:{color:'#475467',lineHeight:21,marginTop:12},stats:{flexDirection:'row',gap:26,marginTop:16},stat:{flexDirection:'row',alignItems:'baseline',gap:5},statNumber:{fontWeight:'900',fontSize:19,color:'#101828'},statLabel:{color:'#667085'},actions:{flexDirection:'row',gap:10,marginTop:16}
});
