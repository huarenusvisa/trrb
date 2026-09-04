import { useEffect, useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { ImageStyle, StyleProp, StyleSheet, Text, View } from 'react-native';

type Props = {
  uri?: string;
  style?: StyleProp<ImageStyle>;
  testID?: string;
};

export async function prefetchNewsImages(uris: Array<string | undefined>, limit = 6) {
  const unique = [...new Set(uris.filter((uri): uri is string => Boolean(uri)))].slice(0, limit);
  if (!unique.length) return false;
  return ExpoImage.prefetch(unique, 'memory-disk').catch(() => false);
}

export function NewsImage({ uri, style, testID }: Props) {
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setFailed(false);
    setRetryCount(0);
  }, [uri]);

  useEffect(() => {
    if (!uri || !failed || retryCount >= 1) return;
    const timer = setTimeout(() => {
      setRetryCount((current) => current + 1);
      setFailed(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [failed, retryCount, uri]);

  if (!uri || failed) {
    return (
      <View testID={testID ? `${testID}-placeholder` : undefined} style={[style, styles.placeholder]} accessible={false}>
        <Text style={styles.mark}>唐</Text>
      </View>
    );
  }

  return (
    <ExpoImage
      key={`${uri}:${retryCount}`}
      testID={testID}
      source={{ uri }}
      style={style}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={`${uri}:${retryCount}`}
      transition={120}
      accessible={false}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e4e7ec' },
  mark: { color: '#98a2b3', fontSize: 18, fontWeight: '900' },
});
