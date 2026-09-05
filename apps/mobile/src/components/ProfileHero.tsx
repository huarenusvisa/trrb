import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TrRbAvatar } from './TrRbAvatar';
import { publicProfileMediaUrl } from '../social/media';
import type { SocialProfile } from '../social/types';
import { useI18n } from '../i18n/I18nProvider';

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
  const { t } = useI18n();
  const cover = publicProfileMediaUrl(profile.cover_path);
  return <View style={styles.card}>
    <View style={styles.cover}>
      {cover ? <Image source={{ uri: cover }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : <View style={styles.coverFallback}><View style={styles.glowOne} /><View style={styles.glowTwo} /></View>}
    </View>
    <View style={styles.body}>
      <View style={styles.avatarWrap}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={88} label={t('userProfile.avatarA11y', { name: profile.display_name || t('userProfile.readerFallback') })} /></View>
      <View style={styles.nameRow}>
        <View style={styles.nameCopy}><Text style={styles.name}>{profile.display_name || t('userProfile.readerFallback')}</Text><Text style={styles.privacy}>{profile.is_private ? t('userProfile.privateAccount') : t('userProfile.publicAccount')}</Text></View>
        {own && onEdit ? <Pressable accessibilityRole="button" accessibilityLabel={t('userProfile.edit')} style={styles.edit} onPress={onEdit}><Text style={styles.editText}>{t('userProfile.edit')}</Text></Pressable> : null}
      </View>
      <Text style={styles.bio}>{profile.bio?.trim() || t('userProfile.bioFallback')}</Text>
      <View style={styles.stats}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('userProfile.followingCountA11y', { count: following })} style={styles.stat} onPress={onFollowing}><Text style={styles.statNumber}>{following}</Text><Text style={styles.statLabel}>{t('userProfile.followingLabel')}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('userProfile.followersCountA11y', { count: followers })} style={styles.stat} onPress={onFollowers}><Text style={styles.statNumber}>{followers}</Text><Text style={styles.statLabel}>{t('userProfile.followersLabel')}</Text></Pressable>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card:{backgroundColor:'#fff',borderRadius:22,overflow:'hidden',borderWidth:1,borderColor:'#e4e7ec'},cover:{height:154,backgroundColor:'#dbeafe'},coverFallback:{flex:1,backgroundColor:'#0f4c81',overflow:'hidden'},glowOne:{position:'absolute',width:240,height:240,borderRadius:120,backgroundColor:'#5dd6dd',opacity:.38,right:-55,top:-100},glowTwo:{position:'absolute',width:220,height:220,borderRadius:110,backgroundColor:'#8b5cf6',opacity:.28,left:-70,bottom:-130},body:{paddingHorizontal:18,paddingBottom:18},avatarWrap:{width:98,height:98,borderRadius:49,backgroundColor:'#fff',padding:5,marginTop:-49},nameRow:{flexDirection:'row',alignItems:'center',gap:12,marginTop:10},nameCopy:{flex:1},name:{fontSize:25,fontWeight:'900',color:'#101828'},privacy:{fontSize:12,color:'#667085',marginTop:4,fontWeight:'700'},edit:{borderWidth:1,borderColor:'#d0d5dd',borderRadius:10,paddingHorizontal:14,paddingVertical:10},editText:{fontWeight:'800',color:'#344054'},bio:{color:'#475467',lineHeight:21,marginTop:12},stats:{flexDirection:'row',gap:26,marginTop:16},stat:{flexDirection:'row',alignItems:'baseline',gap:5},statNumber:{fontWeight:'900',fontSize:19,color:'#101828'},statLabel:{color:'#667085'},actions:{flexDirection:'row',gap:10,marginTop:16}
});
