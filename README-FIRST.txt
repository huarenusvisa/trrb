唐人日报 v30 部署说明

重要：你当前 GitHub 的根目录 index.html 已经被误改成只有 42 行的“专题模块”。
不要继续使用那个 42 行文件作为完整首页。请先恢复原完整 index.html，再替换专题部分。

本包提供：
1. HOME-TOPIC-SECTION.html —— 只替换完整首页里的 <section class="topics">...</section>
2. assets/home-topics.css —— 首页专题样式
3. assets/topics/trump.webp —— 特朗普头像
4. ice/index.html、ice/ice.css、ice/ice.js —— 唯一保留的 ICE 独立页面
5. data/ice.json —— ICE 页面示例数据

首页 head 中加入：
<link rel="stylesheet" href="/assets/home-topics.css?v=30">

删除冲突目录：
- 删除整个 /topic/ice/ 目录
- 保留 /ice/ 目录
- 首页 ICE 链接必须是 /ice/

GitHub 网页删除 /topic/ice/：
进入 topic/ice，逐个打开文件，点击垃圾桶 Delete this file，提交。
GitHub 网页不能直接删除非空文件夹，文件删完后文件夹会自动消失。

部署后检查：
https://trrb.net/
https://trrb.net/ice/
https://trrb.net/election/

注意：data/ice.json 当前是示例结构，不代表真实执法数据。你的自动化程序应覆盖此文件。
