import { StyleSheet, View } from 'react-native';
import JobsScreen from '../jobs';
import { useI18n } from '../../src/i18n/I18nProvider';

export default function JobsTabScreen() {
  const { t } = useI18n();

  return (
    <View testID="screen-immigration" accessibilityLabel={t('tab.immigration')} style={styles.page}>
      <JobsScreen embedded />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f9fd' },
});
