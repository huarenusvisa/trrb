import { memo, useEffect, useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import { ImageStyle, StyleProp, StyleSheet, Text, View } from 'react-native';
import { imageFailureKeysToPrune, imageRetryDelay, nextImageFailure, type ImageFailureState } from './news-image-retry-core';

type Props = {
  uri?: string;
  style?: StyleProp<ImageStyle>;
  testID?: string;
  priority?: 'low' | 'normal' | 'high';
};

const sharedFailures = new Map<string, ImageFailureState>();

function sharedRetryDelay(uri: string) {
  return imageRetryDelay(sharedFailures.get(uri));
}

function recordSharedFailure(uri: string) {
  sharedFailures.set(uri, nextImageFailure(sharedFailures.get(uri)));
  const keysToRemove = imageFailureKeysToPrune([...sharedFailures].map(([key, state]) => ({ key, state })));
  for (const key of keysToRemove) sharedFailures.delete(key);
}

export async function prefetchNewsImages(uris: Array<string | undefined>, limit = 6) {
  const unique = [
    ...new Set(uris.filter((uri): uri is string => typeof uri === 'string' && uri.length > 0 && sharedRetryDelay(uri) === 0)),
  ].slice(0, limit);
  if (!unique.length) return false;
  return ExpoImage.prefetch(unique, 'memory-disk').catch(() => false);
}

export const NewsImage = memo(function NewsImage({ uri, style, testID, priority = 'normal' }: Props) {
  const [failed, setFailed] = useState(() => Boolean(uri && sharedRetryDelay(uri)));
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setFailed(Boolean(uri && sharedRetryDelay(uri)));
    setRetryCount(0);
  }, [uri]);

  useEffect(() => {
    if (!uri || !failed) return;
    const delay = sharedRetryDelay(uri);
    if (delay <= 0) {
      setRetryCount((current) => current + 1);
      setFailed(false);
      return;
    }
    const timer = setTimeout(() => {
      setRetryCount((current) => current + 1);
      setFailed(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [failed, uri]);

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
      priority={priority}
      allowDownscaling
      enforceEarlyResizing
      recyclingKey={uri}
      transition={120}
      accessible={false}
      onLoad={() => sharedFailures.delete(uri)}
      onError={() => {
        recordSharedFailure(uri);
        setFailed(true);
      }}
    />
  );
});

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e4e7ec' },
  mark: { color: '#98a2b3', fontSize: 18, fontWeight: '900' },
});
