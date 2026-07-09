唐人日报后台 v1 上传说明

1. 解压 trrb-admin-v1.zip。
2. 得到 admin 文件夹。
3. 打开 GitHub 仓库 huarenusvisa/trrb。
4. 点击 Add file -> Upload files。
5. 把整个 admin 文件夹拖进去。
6. Commit changes。
7. 等 Netlify 自动部署完成。
8. 打开 https://new.trrb.net/admin/
9. 用 Supabase Authentication 里创建的管理员邮箱和密码登录。

注意：
- 不要上传 service_role / secret key。
- 当前后台使用 publishable key + Supabase Auth + RLS 权限。
