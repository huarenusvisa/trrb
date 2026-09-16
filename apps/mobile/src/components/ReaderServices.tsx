import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../i18n/I18nProvider';
import { ReaderServiceError, subscribeReader, submitReaderTip } from '../api/reader-services';

export function ReaderServices() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [email,setEmail] = useState('');
  const [subscribing,setSubscribing] = useState(false);
  const [subStatus,setSubStatus] = useState<'email'|'failed'|'success'|''>('');
  const [tipOpen,setTipOpen] = useState(false);
  const [message,setMessage] = useState('');
  const [name,setName] = useState('');
  const [contact,setContact] = useState('');
  const [sending,setSending] = useState(false);
  const [tipStatus,setTipStatus] = useState<'message'|'failed'|'success'|''>('');
  const [qrFailed,setQrFailed] = useState(false);
  const [qrAttempt,setQrAttempt] = useState(0);
  const subscriptionLock = useRef(false);
  const tipLock = useRef(false);
  const emailInput = useRef<TextInput>(null);
  const tipButton = useRef<View>(null);

  async function subscribe() {
    if(subscriptionLock.current) return;
    subscriptionLock.current = true; setSubscribing(true); setSubStatus('');
    try { await subscribeReader(email); setSubStatus('success'); setEmail(''); }
    catch(error) { setSubStatus(error instanceof ReaderServiceError && error.code === 'email' ? 'email' : 'failed'); }
    finally { subscriptionLock.current = false; setSubscribing(false); }
  }
  async function sendTip() {
    if(tipLock.current) return;
    tipLock.current = true; setSending(true); setTipStatus('');
    try { await submitReaderTip({message,name,contact}); setTipStatus('success'); setMessage(''); setName(''); setContact(''); }
    catch(error) { setTipStatus(error instanceof ReaderServiceError && error.code === 'message' ? 'message' : 'failed'); }
    finally { tipLock.current = false; setSending(false); }
  }
  const closeTip = () => { if(!tipLock.current) setTipOpen(false); };

  return <View testID="home-reader-services" style={styles.card}>
    <View style={styles.section}>
      <Text style={styles.title}>{t('home.readerSubscribeTitle')}</Text>
      <Text style={styles.subtitle}>{t('home.readerSubscribeSubtitle')}</Text>
      <View style={styles.emailRow}>
        <TextInput ref={emailInput} testID="reader-email" accessibilityLabel={t('reader.email')} placeholder={t('reader.email')} value={email} onChangeText={value => {setEmail(value);setSubStatus('');}} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" maxLength={254} editable={!subscribing} returnKeyType="send" onSubmitEditing={() => void subscribe()} style={[styles.input,styles.email]} />
        <Pressable testID="reader-subscribe" accessibilityRole="button" disabled={subscribing} accessibilityState={{disabled:subscribing,busy:subscribing}} style={[styles.button,subscribing && styles.disabled]} onPress={() => void subscribe()}>{subscribing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('home.readerSubscribeAction')}</Text>}</Pressable>
      </View>
      {subStatus ? <Text accessibilityLiveRegion="polite" style={subStatus === 'success' ? styles.success : styles.error}>{t(subStatus === 'success' ? 'reader.subscribed' : subStatus === 'email' ? 'reader.invalidEmail' : 'reader.failed')}</Text> : null}
    </View>
    <View style={styles.section}>
      <Text style={styles.title}>{t('home.readerGroupTitle')}</Text>
      <Text style={styles.subtitle}>{t('reader.qrHint')}</Text>
      {qrFailed ? <Pressable accessibilityRole="button" style={styles.retry} onPress={() => {setQrAttempt(value => value+1);setQrFailed(false);}}><Text style={styles.error}>{t('reader.retryQr')}</Text></Pressable> : <Image key={qrAttempt} testID="reader-wechat-qr" accessible accessibilityLabel={t('reader.qrLabel')} source={{uri:`https://trrb.net/assets/reader-group-qr.jpeg?v=31.9&retry=${qrAttempt}`}} contentFit="contain" style={styles.qr} onError={() => setQrFailed(true)} />}
    </View>
    <View style={styles.lastSection}>
      <View style={styles.tipRow}><View style={styles.tipCopy}><Text style={styles.title}>{t('home.readerTipsTitle')}</Text><Text style={styles.subtitle}>{t('reader.tipIntro')}</Text></View>
      <Pressable ref={tipButton} testID="reader-open-tip" accessibilityRole="button" style={styles.tipButton} onPress={() => {setTipOpen(true);setTipStatus('');}}><Text style={styles.tipButtonText}>{t('home.readerTipsAction')}</Text></Pressable></View>
    </View>
    <Modal visible={tipOpen} transparent animationType="slide" onRequestClose={closeTip}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.backdrop,{paddingTop:insets.top+12,paddingBottom:insets.bottom+12}]}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.dialogHead}><Text accessibilityRole="header" style={styles.title}>{t('home.readerTipsTitle')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('reader.close')} disabled={sending} style={styles.close} onPress={closeTip}><Text style={styles.closeText}>×</Text></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogBody}>
            {tipStatus === 'success' ? <><Text accessibilityLiveRegion="polite" style={styles.success}>{t('reader.tipReceived')}</Text><Pressable accessibilityRole="button" style={styles.button} onPress={closeTip}><Text style={styles.buttonText}>{t('reader.done')}</Text></Pressable></> : <>
              <Text style={styles.subtitle}>{t('reader.tipPrivacy')}</Text>
              <Text style={styles.label}>{t('reader.message')}</Text><TextInput testID="reader-tip-message" accessibilityLabel={t('reader.message')} autoFocus multiline textAlignVertical="top" maxLength={10000} value={message} onChangeText={value => {setMessage(value);setTipStatus('');}} editable={!sending} placeholder={t('reader.messageHint')} style={[styles.input,styles.message]} />
              <Text style={styles.label}>{t('reader.name')}</Text><TextInput accessibilityLabel={t('reader.name')} value={name} onChangeText={setName} maxLength={100} editable={!sending} style={styles.input} />
              <Text style={styles.label}>{t('reader.contact')}</Text><TextInput accessibilityLabel={t('reader.contact')} value={contact} onChangeText={setContact} maxLength={300} editable={!sending} autoCapitalize="none" style={styles.input} />
              {tipStatus ? <Text accessibilityLiveRegion="polite" style={styles.error}>{t(tipStatus === 'message' ? 'reader.invalidMessage' : 'reader.failed')}</Text> : null}
              <Pressable testID="reader-send-tip" accessibilityRole="button" accessibilityState={{disabled:sending,busy:sending}} disabled={sending} style={[styles.button,sending && styles.disabled]} onPress={() => void sendTip()}>{sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('home.readerTipsAction')}</Text>}</Pressable>
            </>}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
 card:{backgroundColor:'#fff',borderRadius:10,paddingHorizontal:12,marginBottom:12,borderWidth:StyleSheet.hairlineWidth,borderColor:'#e4e7ec'},
 section:{paddingVertical:14,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#eaecf0'},lastSection:{paddingVertical:14},
 title:{color:'#101828',fontSize:17,fontWeight:'800'},subtitle:{color:'#667085',fontSize:12,lineHeight:18,marginTop:5},
 emailRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},email:{flexGrow:1,flexBasis:180},input:{minHeight:44,borderWidth:1,borderColor:'#cbd2dc',borderRadius:7,paddingHorizontal:10,paddingVertical:10,fontSize:14,color:'#101828',backgroundColor:'#fff'},
 button:{minHeight:44,paddingHorizontal:14,paddingVertical:10,backgroundColor:'#c8211e',borderRadius:7,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:13,color:'#fff',fontWeight:'800'},disabled:{opacity:0.55},
 qr:{width:'100%',maxWidth:260,aspectRatio:888/1134,alignSelf:'center',marginTop:8,backgroundColor:'#fff'},retry:{minHeight:100,alignItems:'center',justifyContent:'center'},
 tipRow:{flexDirection:'row',alignItems:'center',gap:12},tipCopy:{flex:1},tipButton:{minHeight:44,justifyContent:'center',paddingHorizontal:6},tipButtonText:{color:'#c8211e',fontSize:13,fontWeight:'800'},
 backdrop:{flex:1,backgroundColor:'rgba(16,24,40,0.5)',paddingHorizontal:16,justifyContent:'center'},dialog:{backgroundColor:'#fff',borderRadius:14,maxHeight:'100%',width:'100%',maxWidth:540,alignSelf:'center'},dialogHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingLeft:18,paddingRight:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#eaecf0'},close:{width:44,height:48,alignItems:'center',justifyContent:'center'},closeText:{fontSize:28,color:'#667085'},dialogBody:{padding:18,gap:10},label:{fontSize:13,fontWeight:'700',color:'#344054'},message:{minHeight:150},success:{fontSize:13,lineHeight:20,color:'#157347',marginTop:8},error:{fontSize:13,lineHeight:20,color:'#b42318',marginTop:8},
});
