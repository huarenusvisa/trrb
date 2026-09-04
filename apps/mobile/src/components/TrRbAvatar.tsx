import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { publicProfileMediaUrl } from '../social/media';

type Props = { avatarKey?: string | null; avatarPath?: string | null; size?: number; label?: string };

const BACKGROUNDS = ['#7F1D1D','#9A3412','#854D0E','#3F6212','#166534','#115E59','#155E75','#1E40AF','#3730A3','#5B21B6','#86198F','#9D174D'];
const SYMBOLS = ['山','海','云','星','月','风','松','竹','舟','鹿'];

function indexFromKey(key?: string | null) {
  const match = String(key || '').match(/^avatar_(\d{3})$/);
  const n = match ? Number(match[1]) : 1;
  return Math.min(119, Math.max(0, n - 1));
}

function initialFromKey(key?: string | null) {
  const value = String(key || '');
  if (!value.startsWith('initial:')) return '';
  return Array.from(value.slice(8))[0]?.toUpperCase() || '';
}

function colorForInitial(initial: string) {
  const code = Array.from(initial)[0]?.codePointAt(0) || 0;
  return BACKGROUNDS[code % BACKGROUNDS.length];
}

export function TrRbAvatar({ avatarKey, avatarPath, size = 44, label }: Props) {
  const uploaded = publicProfileMediaUrl(avatarPath);
  if (uploaded) return (
    <Image
      accessibilityLabel={label || '用户头像'}
      source={{ uri: uploaded }}
      contentFit="cover"
      transition={150}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#eaecf0' }}
    />
  );
  const initial = initialFromKey(avatarKey);
  if (initial) return (
    <View accessibilityLabel={label || `字母头像${initial}`} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorForInitial(initial) }]}>
      <Text style={[styles.symbol, { fontSize: Math.max(16, Math.round(size * 0.42)) }]}>{initial}</Text>
    </View>
  );
  const index = indexFromKey(avatarKey);
  const bg = BACKGROUNDS[Math.floor(index / SYMBOLS.length) % BACKGROUNDS.length];
  const symbol = SYMBOLS[index % SYMBOLS.length];
  return (
    <View accessibilityLabel={label || `默认头像${index + 1}`} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.symbol, { fontSize: Math.max(16, Math.round(size * 0.42)) }]}>{symbol}</Text>
    </View>
  );
}

export function isTrRbDefaultAvatarKey(value?: string | null) {
  const match = String(value || '').match(/^avatar_(\d{3})$/);
  return Boolean(match && Number(match[1]) >= 1 && Number(match[1]) <= 120);
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  symbol: { color: '#fff', fontWeight: '900' }
});
