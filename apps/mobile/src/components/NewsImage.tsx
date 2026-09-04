import { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, Text, View } from 'react-native';

type Props = {
  uri?: string;
  style?: StyleProp<ImageStyle>;
  testID?: string;
};

export function NewsImage({ uri, style, testID }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [uri]);

  if (!uri || failed) {
    return (
      <View testID={testID ? `${testID}-placeholder` : undefined} style={[style, styles.placeholder]} accessibilityLabel="新闻图片暂不可用">
        <Text style={styles.mark}>唐</Text>
      </View>
    );
  }

  return <Image testID={testID} source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e4e7ec' },
  mark: { color: '#98a2b3', fontSize: 18, fontWeight: '900' },
});

