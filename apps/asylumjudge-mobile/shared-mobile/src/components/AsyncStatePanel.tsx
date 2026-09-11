import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  testID?: string;
  title: string;
  message: string;
  tone?: 'neutral' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
};

export function AsyncStatePanel({ testID, title, message, tone = 'neutral', actionLabel, onAction, busy = false }: Props) {
  const isError = tone === 'error';
  return (
    <View
      testID={testID}
      accessibilityRole={isError ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.panel, isError && styles.errorPanel]}
    >
      {busy ? <ActivityIndicator color="#c8211e" /> : <Text style={[styles.icon, isError && styles.errorIcon]}>{isError ? '!' : '✓'}</Text>}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          style={[styles.action, busy && styles.disabled]}
          onPress={onAction}
        >
          <Text style={styles.actionText}>{busy ? '正在重试…' : actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel:{backgroundColor:'#fff',borderRadius:16,paddingHorizontal:22,paddingVertical:28,alignItems:'center',borderWidth:1,borderColor:'#eaecf0'},
  errorPanel:{backgroundColor:'#fff8f7',borderColor:'#fecdca'},
  icon:{width:36,height:36,borderRadius:18,textAlign:'center',textAlignVertical:'center',lineHeight:36,overflow:'hidden',backgroundColor:'#ecfdf3',color:'#067647',fontSize:20,fontWeight:'900'},
  errorIcon:{backgroundColor:'#fee4e2',color:'#b42318'},
  title:{fontSize:18,fontWeight:'900',color:'#101828',marginTop:12,textAlign:'center'},
  message:{fontSize:14,lineHeight:21,color:'#667085',marginTop:6,textAlign:'center'},
  action:{minHeight:44,borderRadius:10,backgroundColor:'#c8211e',paddingHorizontal:20,marginTop:16,alignItems:'center',justifyContent:'center'},
  disabled:{opacity:0.58},
  actionText:{color:'#fff',fontWeight:'900'},
});
