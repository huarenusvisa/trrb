唐人日报一次性目录修复包

请把本压缩包解压后，将里面的内容上传到 GitHub 仓库 huarenusvisa/trrb 的根目录，并允许覆盖同名文件。

正确结果：
/index.html                 新闻前台
/admin/index.html           后台登录
/admin/admin.js             后台脚本
/admin/styles.css           后台样式
/netlify.toml               Netlify 配置（无 admin 循环重定向）
/_headers                   缓存与安全响应头
/_redirects                 旧图片路径和 HTTPS 跳转

不要把整个 trrb-one-click-structure-fix 文件夹作为二级目录上传。
不要上传到 admin 文件夹内部。
不要修改 Publish directory，继续保持 .

发布后：
https://new.trrb.net/        新闻前台
https://new.trrb.net/admin/  后台登录
