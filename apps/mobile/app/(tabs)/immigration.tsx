import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const BASE_URL = 'https://trrb.net/immigrate';
const ASYLUM_JUDGE_APP_URL = 'asylumjudge://';
const ASYLUM_JUDGE_WEB_URL = 'https://asylumjudge.com/';

async function openAsylumJudge() {
  try {
    if (await Linking.canOpenURL(ASYLUM_JUDGE_APP_URL)) {
      await Linking.openURL(ASYLUM_JUDGE_APP_URL);
      return;
    }
  } catch {
    // Some Android devices reject custom-scheme checks. The public site remains
    // the stable fallback and does not require the native app to be installed.
  }

  await Linking.openURL(ASYLUM_JUDGE_WEB_URL);
}

const pathways = [
  {
    key: 'study',
    name: '赴美留学',
    en: 'Study in the U.S.',
    description: '学生、交流访问、实习与毕业后身份规划',
    topics: [
      ['F-1学生签证', 'f1'],
      ['J-1交流访问', 'j1'],
      ['CPT', 'cpt'],
      ['OPT', 'opt'],
      ['STEM OPT', 'stem-opt'],
    ],
  },
  {
    key: 'work',
    name: '赴美工作',
    en: 'Work in the U.S.',
    description: '工作签证、跨国派遣、创业与专业服务',
    topics: [
      ['H-1B专业工作', 'h1b'],
      ['L-1跨国公司派遣', 'l1'],
      ['O-1杰出人才', 'o1'],
      ['H-2B临时工', 'h2b'],
      ['R-1宗教工作者', 'r1'],
    ],
  },
  {
    key: 'employment',
    name: '职业移民',
    en: 'Employment-Based Immigration',
    description: '专业能力、雇主担保、跨国管理与投资绿卡',
    topics: [
      ['EB-1A杰出人才', 'eb1a'],
      ['EB-1C跨国高管', 'eb1c'],
      ['EB-2 NIW', 'niw'],
      ['EB-3', 'eb3'],
      ['EB-5投资移民', 'eb5'],
    ],
  },
  {
    key: 'family',
    name: '家庭移民',
    en: 'Family-Based Immigration',
    description: '婚姻、配偶、父母、子女与家庭优先类别',
    topics: [
      ['美国公民婚姻绿卡', 'citizen-spouse'],
      ['绿卡配偶F2A', 'f2a'],
      ['K-1未婚夫/妻', 'k1'],
      ['父母移民', 'parents'],
      ['CR-1/IR-1', 'cr1-ir1'],
    ],
  },
  {
    key: 'humanitarian',
    name: '人道主义庇护',
    en: 'Humanitarian Protection',
    description: '庇护、递解保护、家暴与犯罪受害者保护',
    topics: [
      ['政治庇护', 'asylum'],
      ['防止递解', 'withholding'],
      ['CAT保护', 'cat'],
      ['VAWA家暴保护', 'vawa'],
      ['SIJS特殊青少年', 'sijs'],
    ],
  },
  {
    key: 'change-status',
    name: '境内身份转换',
    en: 'Change of Status in the U.S.',
    description: '转换、延期、恢复、调整身份、工卡与旅行许可',
    topics: [
      ['B-2转F-1', 'b2-to-f1'],
      ['F-1转H-1B', 'f1-to-h1b'],
      ['J-1豁免', 'j1-waiver'],
      ['I-485境内调整身份', 'i485'],
      ['EAD工卡', 'ead'],
    ],
  },
  {
    key: 'citizenship',
    name: '入籍美国公民',
    en: 'U.S. Citizenship',
    description: '入籍资格、N-400、考试面试、宣誓与公民证明',
    topics: [
      ['N-400入籍申请', 'n400'],
      ['连续居住', 'continuous-residence'],
      ['实际居住', 'physical-presence'],
      ['英语与公民考试', 'tests'],
      ['N-600公民证明', 'n600'],
    ],
  },
] as const;

function centerUrl(path: string, topic?: string) {
  const topicPart = topic ? `&topic=${encodeURIComponent(topic)}` : '';
  return `${BASE_URL}/center.html?path=${encodeURIComponent(path)}${topicPart}`;
}

export default function ImmigrationScreen() {
  return (
    <ScrollView testID="screen-immigration" style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <View>
          <Text style={styles.h1}>移民美国</Text>
          <Text style={styles.sub}>按赴美目标进入对应签证、绿卡与身份知识中心</Text>
        </View>
        <Pressable style={styles.allButton} onPress={() => Linking.openURL(`${BASE_URL}/`)}>
          <Text style={styles.allButtonText}>完整知识库</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statsStrong}>7大知识中心</Text>
        <Text style={styles.statsText}>与 trrb.net 移民美国目录一致</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="打开 AsylumJudge 移民法官查询"
        testID="asylumjudge-entry"
        style={styles.judgeCard}
        onPress={() => void openAsylumJudge()}
      >
        <View style={styles.judgeCardTop}>
          <View style={styles.judgeBadge}>
            <Text style={styles.judgeBadgeText}>专业工具</Text>
          </View>
          <Text style={styles.judgeArrow}>打开 ›</Text>
        </View>
        <Text style={styles.judgeTitle}>AsylumJudge 移民法官查询</Text>
        <Text style={styles.judgeDescription}>查询法官、法院及国籍历史数据；已安装独立 App 时直接打开，否则进入网页版。</Text>
        <Text style={styles.judgeDisclaimer}>历史数据仅供信息参考，不构成结果预测或法律意见。</Text>
      </Pressable>

      {pathways.map((pathway, index) => (
        <Pressable key={pathway.key} style={styles.card} onPress={() => Linking.openURL(centerUrl(pathway.key))}>
          <View style={styles.cardTop}>
            <Text style={styles.number}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={styles.cardTitleBlock}>
              <Text style={styles.title}>{pathway.name}</Text>
              <Text style={styles.en}>{pathway.en}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </View>
          <Text style={styles.description}>{pathway.description}</Text>
          <View style={styles.topicRow}>
            {pathway.topics.map(([name, slug]) => (
              <Pressable
                key={slug}
                style={styles.topicChip}
                onPress={(event) => {
                  event.stopPropagation();
                  void Linking.openURL(centerUrl(pathway.key, slug));
                }}
              >
                <Text style={styles.topicText}>{name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.enter}>进入知识中心 →</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f6f8' },
  content: { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 96 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '800', color: '#101828' },
  sub: { color: '#667085', fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 245 },
  allButton: { backgroundColor: '#101828', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  allButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statsStrong: { color: '#c8211e', fontSize: 13, fontWeight: '800' },
  statsText: { color: '#98a2b3', fontSize: 12 },
  judgeCard: { backgroundColor: '#101828', borderRadius: 14, padding: 16, marginBottom: 12 },
  judgeCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  judgeBadge: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  judgeBadgeText: { color: '#c8211e', fontSize: 11, fontWeight: '800' },
  judgeArrow: { color: '#fff', fontSize: 13, fontWeight: '800' },
  judgeTitle: { color: '#fff', fontSize: 18, lineHeight: 24, fontWeight: '800' },
  judgeDescription: { color: '#d0d5dd', fontSize: 13, lineHeight: 20, marginTop: 7 },
  judgeDisclaimer: { color: '#98a2b3', fontSize: 11, lineHeight: 17, marginTop: 10 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  number: { width: 28, color: '#c8211e', fontSize: 12, fontWeight: '800' },
  cardTitleBlock: { flex: 1 },
  title: { color: '#101828', fontSize: 17, lineHeight: 22, fontWeight: '800' },
  en: { color: '#98a2b3', fontSize: 11, marginTop: 2 },
  arrow: { color: '#98a2b3', fontSize: 26, lineHeight: 28 },
  description: { color: '#667085', fontSize: 13, lineHeight: 19, marginTop: 9 },
  topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  topicChip: { backgroundColor: '#f5f6f8', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  topicText: { color: '#344054', fontSize: 11, fontWeight: '700' },
  enter: { color: '#c8211e', fontSize: 12, fontWeight: '800', marginTop: 11 },
});
