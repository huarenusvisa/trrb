这是唐人日报后台登录权限与缓存修复补丁。

请将本压缩包中的文件覆盖到当前项目根目录：
1. admin/index.html
2. admin/admin.js
3. admin/styles.css
4. _headers
5. netlify.toml

不要删除项目中的其他文件、图片、文章数据或前台页面。
覆盖后提交并重新部署。

修复内容：
- owner/admin 均可进入后台
- 后台页面和登录请求禁用缓存
- 自动清除旧 Service Worker 与 Cache Storage
- /admin 自动跳转 /admin/
- 不再需要 ?v=adminfix1
