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
  account?: string;
  own?: boolean;
  onEdit?: () => void;
  onFollowers?: () => void;
  onFollowing?: () => void;
  actions?: React.ReactNode;
};

export function ProfileHero({ profile, followers, following, account, own, onEdit, onFollowers, onFollowing, actions }: Props) {
  const { t } = useI18n();
  const cover = publicProfileMediaUrl(profile.cover_path);
  return <View style={styles.card}>
    <Pressable testID={own ? 'profile-edit-cover' : undefined} accessibilityRole={own ? 'button' : undefined} accessibilityLabel={own ? t('profileSettings.changeCoverA11y') : undefined} disabled={!own || !onEdit} onPress={onEdit} style={styles.cover}>
      {cover ? <Image source={{ uri: cover }} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} /> : <View style={styles.coverFallback}><View style={styles.glowOne} /><View style={styles.glowTwo} /></View>}
      {own && onEdit ? <View style={styles.coverEdit}><Text style={styles.coverEditText}>{t('profileSettings.changeCover')}</Text></View> : null}
    </Pressable>
    <View style={styles.body}>
      <Pressable testID={own ? 'profile-edit-avatar' : undefined} accessibilityRole={own ? 'button' : undefined} accessibilityLabel={own ? t('profileSettings.customAvatarA11y') : undefined} disabled={!own || !onEdit} onPress={onEdit} style={styles.avatarWrap}><TrRbAvatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} size={88} label={t('userProfile.avatarA11y', { name: profile.display_name || t('userProfile.readerFallback') })} />{own && onEdit ? <View style={styles.avatarEdit}><Text style={styles.avatarEditText}>＋</Text></View> : null}</Pressable>
      <View style={styles.nameRow}>
        <View style={styles.nameCopy}><Text style={styles.name}>{profile.display_name || t('userProfile.readerFallback')}</Text>{account ? <Text testID="profile-account-label" style={styles.account}>{account}</Text> : null}<Text style={styles.privacy}>{profile.is_private ? t('userProfile.privateAccount') : t('userProfile.publicAccount')}</Text></View>
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
  card:{backgroundColor:'#fff',borderRadius:20,overflow:'hidden',borderWidth:1,borderColor:'#dbe6df'},cover:{height:142,backgroundColor:'#dcefe4'},coverFallback:{flex:1,backgroundColor:'#116b40',overflow:'hidden'},glowOne:{position:'absolute',width:240,height:240,borderRadius:120,backgroundColor:'#73d59f',opacity:.40,right:-55,top:-100},glowTwo:{position:'absolute',width:220,height:220,borderRadius:110,backgroundColor:'#1f5f9d',opacity:.28,left:-70,bottom:-130},coverEdit:{position:'absolute',right:12,bottom:12,backgroundColor:'rgba(16,32,25,.72)',borderRadius:999,paddingHorizontal:12,paddingVertical:7},coverEditText:{color:'#fff',fontSize:12,fontWeight:'900'},body:{paddingHorizontal:17,paddingBottom:17},avatarWrap:{width:98,height:98,borderRadius:49,backgroundColor:'#fff',padding:5,marginTop:-49},avatarEdit:{position:'absolute',right:1,bottom:2,width:27,height:27,borderRadius:14,backgroundColor:'#14804a',borderWidth:2,borderColor:'#fff',alignItems:'center',justifyContent:'center'},avatarEditText:{color:'#fff',fontWeight:'900',fontSize:18,lineHeight:20},nameRow:{flexDirection:'row',alignItems:'center',gap:12,marginTop:10},nameCopy:{flex:1},name:{fontSize:24,fontWeight:'900',color:'#102019'},account:{fontSize:12,color:'#617168',marginTop:4},privacy:{fontSize:12,color:'#617168',marginTop:4,fontWeight:'700'},edit:{borderWidth:1,borderColor:'#b9c9c0',backgroundColor:'#f7faf8',borderRadius:10,paddingHorizontal:14,paddingVertical:10},editText:{fontWeight:'800',color:'#286243'},bio:{color:'#44564c',lineHeight:21,marginTop:12},stats:{flexDirection:'row',gap:26,marginTop:16},stat:{flexDirection:'row',alignItems:'baseline',gap:5},statNumber:{fontWeight:'900',fontSize:19,color:'#102019'},statLabel:{color:'#617168'},actions:{flexDirection:'row',gap:10,marginTop:16}
});
