import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../src/i18n/I18nProvider';
import { LocalePreference, MessageKey } from '../src/i18n/i18n-core';

const OPTIONS: { preference: LocalePreference; label: MessageKey; meta: MessageKey }[] = [
  { preference: 'system', label: 'language.system', meta: 'language.systemMeta' },
  { preference: 'zh-CN', label: 'language.zhCN', meta: 'language.zhCNMeta' },
  { preference: 'zh-TW', label: 'language.zhTW', meta: 'language.zhTWMeta' },
  { preference: 'en', label: 'language.en', meta: 'language.enMeta' },
];

export default function LanguageSettingsScreen() {
  const { preference, setPreference, t } = useI18n();
  return (
    <ScrollView testID="screen-language-settings" style={styles.page} contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ {t('common.back')}</Text></Pressable>
      <Text style={styles.h1}>{t('language.heading')}</Text>
      <Text style={styles.description}>{t('language.description')}</Text>
      <View style={styles.list}>
        {OPTIONS.map((option) => {
          const selected = option.preference === preference;
          return (
            <Pressable
              key={option.preference}
              testID={`language-option-${option.preference}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => void setPreference(option.preference)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <View style={styles.optionText}>
                <Text style={styles.title}>{t(option.label)}</Text>
                <Text style={styles.meta}>{t(option.meta)}</Text>
              </View>
              <Text style={[styles.check, selected && styles.checkSelected]}>{selected ? `✓ ${t('language.selected')}` : '○'}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f8' },
  content: { padding: 18, paddingTop: 54, paddingBottom: 40 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 14, marginBottom: 8 },
  backText: { color: '#c8211e', fontWeight: '800', fontSize: 16 },
  h1: { fontSize: 30, fontWeight: '900', color: '#101828' },
  description: { color: '#667085', lineHeight: 21, marginTop: 8, marginBottom: 18 },
  list: { gap: 10 },
  option: { minHeight: 76, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eaecf0', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center' },
  optionSelected: { borderColor: '#c8211e', backgroundColor: '#fff8f7' },
  optionText: { flex: 1, paddingRight: 12 },
  title: { color: '#101828', fontWeight: '800', fontSize: 17 },
  meta: { color: '#667085', marginTop: 4 },
  check: { color: '#98a2b3', fontWeight: '800' },
  checkSelected: { color: '#c8211e' },
});
