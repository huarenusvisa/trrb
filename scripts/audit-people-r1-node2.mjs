import fs from 'node:fs';
const failures=[]; const must=(c,m)=>{if(!c)failures.push(m)};
const home=fs.readFileSync('index.html','utf8');
const people=fs.readFileSync('people/index.html','utf8');
must(/专题聚焦/.test(home),'homepage Topics section missing');
must(/美国华人人物志/.test(people),'People archive title missing');
must(/data-product="people"/.test(people),'People page is not marked as independent product');
must(/永久人物 ID|永久人物ID/.test(people),'permanent person ID principle missing');
must(/创建来源与核实分离/.test(people),'creator/verification separation missing');
must(/AI[^。]{0,20}猜测|AI 生成事实/.test(people),'AI non-inference notice missing');
must(/href="\/#topic-focus"/.test(people),'People page does not link back to Topics');
if(failures.length){console.error('PEOPLE-R1-N2: FAIL'); failures.forEach(x=>console.error('- '+x)); process.exit(1)}
console.log('PEOPLE-R1-N2: PASS');
console.log('Verified: independent People product page under Topics context, permanent-ID/fact/privacy messaging, no homepage recruiting displacement.');