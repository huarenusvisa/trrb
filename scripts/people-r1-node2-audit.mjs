import fs from 'node:fs';

const requiredFiles = ['people/index.html', 'topic-config.js'];
for (const path of requiredFiles) {
  if (!fs.existsSync(path)) throw new Error(`missing required file: ${path}`);
}

const page = fs.readFileSync('people/index.html', 'utf8');
const topic = fs.readFileSync('topic-config.js', 'utf8');

const assertions = [
  ['archive title', page.includes('美国华人人物志')],
  ['independent product marker', page.includes('data-product="people"') && page.includes('独立人物产品')],
  ['permanent ID principle', page.includes('永久人物 ID')],
  ['no AI fact inference', page.includes('不使用 AI 猜测补写')],
  ['source and verification distinction', page.includes('创建来源与核实分离')],
  ['privacy principle', page.includes('隐私优先')],
  ['safe empty state', page.includes('不会用示例人物、虚构履历或 AI 生成事实填充空位')],
  ['topic config registration', topic.includes("people:{title:'美国华人人物志'}")],
  ['topic entry injection', topic.includes("card.href='/people/'") && topic.includes("card.dataset.topic='people'")],
  ['topic location only', topic.includes("document.querySelector('#topic-focus .topic-focus-list')")],
];

let failed = 0;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`PEOPLE-R1-N2 FAIL: ${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('PEOPLE-R1-N2 PASS');
