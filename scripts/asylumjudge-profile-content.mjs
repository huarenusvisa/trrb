import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aggregateAnnualProfiles, profileNameKey } from './asylumjudge-categories.mjs';

// Only attach annual data to an unambiguous profile with reconciling totals.
// Never infer a historical court assignment from a judge's current directory entry.
export async function attachProfileContent(root, judges, courts, courtData) {
  const index = JSON.parse(await readFile(join(root, 'data/immigration-judge-nationality-yearly.json'), 'utf8'));
  const shards = await Promise.all(index.shards.map(async file => JSON.parse(await readFile(join(root, 'data', file), 'utf8'))));
  const profiles = shards.flatMap(shard => shard.profiles || []);
  const annual = aggregateAnnualProfiles(profiles, judges);
  const byId = new Map();
  for (const row of annual) byId.set(row.id, [...(byId.get(row.id) || []), row]);
  const byName = new Map(profiles.map(profile => [profile.name_key, profile]));
  for (const judge of judges) {
    const rows = byId.get(judge.id) || [];
    const matches = rows.length && ['grants', 'denials', 'other_decisions', 'total_asylum_decisions'].every(field =>
      rows.reduce((sum, row) => sum + Number(row[field]), 0) === Number(judge[field] || 0));
    if (matches) {
      judge.prerender_yearly = rows.filter(row => row.fiscal_year >= Number(index.scope_end.slice(0, 4)) - 2).sort((a,b) => b.fiscal_year - a.fiscal_year);
      judge.prerender_nationalities = byName.get(profileNameKey(judge.judge_name))?.rows || [];
      judge.prerender_snapshot = index;
    }
    const court = courts.find(row => row.court_name === judge.court_name && (!judge.court_state || row.court_state === judge.court_state));
    if (court) judge.prerender_court = court;
  }
  for (const court of courts) {
    court.prerender_judges = judges.filter(judge => judge.court_name === court.court_name && (!judge.court_state || judge.court_state === court.court_state));
    court.prerender_period = `FY ${courtData.fiscal_year} · ${courtData.fiscal_year - 1}-10-01 – ${courtData.period_end || courtData.source_snapshot_date}`;
  }
}

const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {
  en: ['Fiscal year','Nationality','Decisions','Granted','Denied','Other','Approval rate','Fewer than 50; rate hidden','Judge profiles · all available years','These profile totals cover all available years; they are not this fiscal year’s court totals.','No verified annual data available.'],
  'zh-Hans': ['财政年度','国籍','结案总数','批准','拒绝','其他','通过率','少于50件，不显示','法院法官档案（全数据范围）','下方法官档案使用全数据范围，不等于本财年法院汇总。','暂无可核验的年度数据。'],
  'zh-Hant': ['財政年度','國籍','結案總數','批准','拒絕','其他','通過率','少於50件，不顯示','法院法官檔案（全資料範圍）','下方法官檔案使用全資料範圍，不等於本財年法院彙總。','暫無可核驗的年度資料。'],
  es: ['Año fiscal','Nacionalidad','Decisiones','Aprobadas','Denegadas','Otros','Tasa de aprobación','Menos de 50; tasa oculta','Perfiles de jueces · todos los años disponibles','Los totales de estos perfiles abarcan todos los años disponibles, no solo el año fiscal del tribunal.','No hay datos anuales verificados.'],
  fr: ['Exercice fiscal','Nationalité','Décisions','Accordées','Refusées','Autres','Taux d’approbation','Moins de 50 ; taux masqué','Profils des juges · toutes les années disponibles','Ces profils couvrent toutes les années disponibles, et non uniquement l’exercice du tribunal.','Aucune donnée annuelle vérifiée disponible.'],
  'pt-BR': ['Ano fiscal','Nacionalidade','Decisões','Aprovadas','Negadas','Outros','Taxa de aprovação','Menos de 50; taxa oculta','Perfis de juízes · todos os anos disponíveis','Os totais dos perfis abrangem todos os anos disponíveis, não apenas o ano fiscal do tribunal.','Sem dados anuais verificados.'],
  hi: ['वित्त वर्ष','राष्ट्रीयता','निर्णय','स्वीकृत','अस्वीकृत','अन्य','स्वीकृति दर','50 से कम; दर छिपी है','न्यायाधीश प्रोफ़ाइल · सभी उपलब्ध वर्ष','इन प्रोफ़ाइल के कुल आँकड़े सभी उपलब्ध वर्षों के हैं, केवल अदालत के इस वित्त वर्ष के नहीं।','सत्यापित वार्षिक डेटा उपलब्ध नहीं है।'],
  ru: ['Финансовый год','Гражданство','Решения','Одобрено','Отказано','Другие','Доля одобрений','Менее 50; доля скрыта','Профили судей · все доступные годы','Итоги профилей охватывают все доступные годы, а не только этот финансовый год суда.','Проверенные годовые данные отсутствуют.'],
  ar: ['السنة المالية','الجنسية','القرارات','الموافقات','الرفض','أخرى','نسبة الموافقة','أقل من 50؛ النسبة مخفية','ملفات القضاة · جميع السنوات المتاحة','تشمل إجماليات الملفات جميع السنوات المتاحة، وليس السنة المالية الحالية للمحكمة فقط.','لا تتوفر بيانات سنوية موثقة.'],
  tr: ['Mali yıl','Uyruk','Kararlar','Onay','Ret','Diğer','Onay oranı','50’den az; oran gizli','Hâkim profilleri · mevcut tüm yıllar','Profil toplamları yalnızca mahkemenin bu mali yılını değil, mevcut tüm yılları kapsar.','Doğrulanmış yıllık veri yok.']
};
export const profileLabels = locale => labels[locale] || labels.en;
export function profileTable(rows, locale, firstLabel, identity) {
  const text = profileLabels(locale);
  const fmt = value => Number(value || 0).toLocaleString(locale);
  const header = [firstLabel, ...text.slice(2,7)].map(value => `<span role="columnheader">${e(value)}</span>`).join('');
  return `<div class="trow thead outcome-row" role="row">${header}</div>` + rows.map(row => {
    const sample = Number(row.grants) + Number(row.denials);
    const rate = sample < 50 ? `—<small>${e(text[7])}</small>` : (Number(row.grants) / sample * 100).toFixed(1) + '%';
    return `<div class="trow outcome-row" role="row"><span role="cell">${identity(row)}</span>${['total_asylum_decisions','grants','denials','other_decisions'].map(field => `<span role="cell">${fmt(row[field])}</span>`).join('')}<span role="cell">${rate}</span></div>`;
  }).join('');
}
