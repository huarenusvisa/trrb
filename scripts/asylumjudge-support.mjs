import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Title, purpose, open, save, close, swipe hint, voluntary/non-deductible notice, recipient.
const copy = {
  '': ['支持本站','支持网站运营与数据更新','支持本站','保存二维码','关闭','左右滑动切换支付方式','金额自定，完全自愿。本款项不属于可抵税的慈善捐款。','收款方'],
  en: ['Support this site','Support site operations and data updates','Support this site','Save QR code','Close','Swipe to switch payment method','Any amount is welcome. Support is voluntary and is not a tax-deductible charitable donation.','Recipient'],
  'zh-hant': ['支持本站','支持網站營運與資料更新','支持本站','儲存二維碼','關閉','左右滑動切換付款方式','金額自定，完全自願。本款項不屬於可抵稅的慈善捐款。','收款方'],
  es: ['Apoya este sitio','Apoya el mantenimiento y la actualización de datos','Apoyar','Guardar código QR','Cerrar','Desliza para cambiar el método de pago','El importe es libre. El apoyo es voluntario y no es una donación benéfica deducible de impuestos.','Destinatario'],
  fr: ['Soutenir ce site','Soutenez le fonctionnement et la mise à jour des données','Soutenir','Enregistrer le code QR','Fermer','Balayez pour changer de moyen de paiement','Montant libre. Ce soutien est volontaire et ne constitue pas un don caritatif déductible des impôts.','Bénéficiaire'],
  'pt-br': ['Apoie este site','Apoie a manutenção e a atualização dos dados','Apoiar','Salvar código QR','Fechar','Deslize para mudar a forma de pagamento','Valor livre. O apoio é voluntário e não é uma doação beneficente dedutível de impostos.','Destinatário'],
  hi: ['इस साइट का समर्थन करें','साइट संचालन और डेटा अपडेट में सहयोग करें','सहयोग करें','QR कोड सहेजें','बंद करें','भुगतान विधि बदलने के लिए स्वाइप करें','राशि आपकी इच्छा पर है। यह स्वैच्छिक सहयोग है, कर-कटौती योग्य धर्मार्थ दान नहीं।','प्राप्तकर्ता'],
  ru: ['Поддержать сайт','Поддержите работу сайта и обновление данных','Поддержать','Сохранить QR-код','Закрыть','Смахните для смены способа оплаты','Любая сумма. Поддержка добровольна и не является благотворительным пожертвованием с налоговым вычетом.','Получатель'],
  ar: ['ادعم هذا الموقع','ساهم في تشغيل الموقع وتحديث البيانات','ادعم الموقع','حفظ رمز QR','إغلاق','اسحب لتغيير طريقة الدفع','المبلغ اختياري. الدعم طوعي وليس تبرعًا خيريًا مؤهلًا للخصم الضريبي.','المستفيد'],
  tr: ['Bu siteyi destekleyin','Site işletimini ve veri güncellemelerini destekleyin','Destekleyin','QR kodunu kaydet','Kapat','Ödeme yöntemini değiştirmek için kaydırın','Tutar size bağlıdır. Destek gönüllüdür ve vergiden düşülebilen bir hayır bağışı değildir.','Alıcı']
};
const esc = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const qr = (method) => `<span class="support-qr support-qr-${method}"><img src="/asylumjudge/support/${method}.jpeg" alt="${method === 'zelle' ? 'Zelle' : 'Alipay'} QR" width="${method === 'zelle' ? 1030 : 840}" height="${method === 'zelle' ? 997 : 846}"></span>`;
export function supportMarkup(locale = '') {
  const [title,purpose,open,save,close,swipe,notice,recipient] = (copy[locale] || copy.en).map(esc);
  const methods = [['zelle','Zelle'],['alipay',locale === '' || locale === 'zh-hant' ? '支付宝' : 'Alipay']];
  return {
    card: `<aside class="site-support" aria-label="${title}" translate="no"><div class="support-heading"><div><strong>${title}</strong><p>${purpose}</p></div><button class="support-mobile-open" type="button" data-support-open="0">${open} <span aria-hidden="true">♡</span></button></div><div class="support-desktop-codes">${methods.map(([method,label],index)=>`<button type="button" data-support-open="${index}" aria-label="${open}: ${label}">${qr(method)}<span>${label}</span></button>`).join('')}</div><small class="support-desktop-note">${recipient}: TANG DAILY LLC</small></aside>`,
    dialog: `<dialog id="site-support-dialog" aria-labelledby="support-dialog-title" translate="no"><div class="support-dialog-heading"><div><h2 id="support-dialog-title">${title}</h2><p>${purpose}</p></div><button type="button" class="support-close" aria-label="${close}">×</button></div><div class="support-tabs" role="tablist" aria-label="Zelle / Alipay">${methods.map(([method,label],index)=>`<button type="button" role="tab" id="support-tab-${index}" aria-controls="support-panel-${index}" aria-selected="${index===0}" tabindex="${index===0?0:-1}" data-support-tab="${index}">${label}</button>`).join('')}</div><div class="support-carousel" dir="ltr">${methods.map(([method,label],index)=>`<section class="support-slide" role="tabpanel" id="support-panel-${index}" aria-labelledby="support-tab-${index}"${index?' inert':''}>${qr(method)}<strong>${label}</strong><a class="support-save" href="/asylumjudge/support/${method}.jpeg" download="${method}-TANG-DAILY-LLC.jpeg">${save}</a></section>`).join('')}</div><p class="support-swipe-hint">${swipe}</p><p class="support-recipient">${recipient}: <b>TANG DAILY LLC</b></p><p class="support-notice">${notice}</p></dialog>`
  };
}
export async function applyAsylumJudgeSupport({ output }) {
  for (const locale of Object.keys(copy)) {
    const file = join(output,locale,'index.html');
    let html = await readFile(file,'utf8');
    if (html.includes('id="site-support-dialog"')) continue;
    const {card,dialog} = supportMarkup(locale);
    html = html.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/, (_, title) => `<div class="shell support-home-heading"><h1>${title}</h1>${card}</div>`);
    html = html.replace('</head>','<link rel="stylesheet" href="/asylumjudge/support.css?v=2"><script src="/asylumjudge/support.js?v=1" defer></script></head>');
    html = html.replace('</body>',`${dialog}</body>`);
    await writeFile(file, html);
  }
}
