# 唐人日报 V30：ICE执法自动抓取与自动发布

这个补丁包适用于当前 `new.trrb.net` 的 GitHub + Netlify 静态站点。

它会完成以下工作：

1. 使用你现有的 X API Bearer Token 抓取 `@ICEgov` 新帖子。
2. 自动读取帖子中可访问的 `ice.gov` 官方新闻稿。
3. 使用 OpenAI 将来源整理为客观中文新闻。
4. 原始资料少时生成短快讯；有完整官方稿时生成约 260–380 个中文字符的新闻。
5. 自动生成独立文章页，并统一写入 `/topic/ice/`，不设置分类。
6. 自动更新首页现有的“ICE执法”卡片、专题数据和 `sitemap.xml`。
7. GitHub 提交后由 Netlify 自动部署。

## 一、上传文件

把压缩包内的所有文件复制到唐人日报 GitHub 仓库根目录。

不要放进单独的子文件夹。上传完成后，仓库根目录应看到：

```text
.github/workflows/ice-auto-publish.yml
scripts/ice-sync.mjs
assets/ice-home-widget.js
assets/ice-topic.css
assets/ice-topic.js
topic/ice/index.html
data/ice-news.json
data/ice-state.json
data/ice-pending.json
```

现有 `index.html` 不需要你手工改。第一次运行时，程序会：

- 自动在首页加入 `ice-home-widget.js`；
- 尝试把包含“ICE执法”的现有链接改成 `/topic/ice/`；
- 即使原页面结构不同，前端脚本也会寻找最小的“ICE执法”卡片并让它可以点击。

## 二、设置 GitHub Secrets

进入唐人日报仓库：

```text
Settings → Secrets and variables → Actions → New repository secret
```

加入：

```text
X_BEARER_TOKEN
OPENAI_API_KEY
OPENAI_MODEL
```

`OPENAI_MODEL` 可填：

```text
gpt-4.1-mini
```

你在华人美国签证网已经有 X API，但 GitHub Secret 通常是仓库级别的，因此要把同一个 Token 再加入唐人日报仓库；不要把密钥写进代码。

## 三、允许工作流写入仓库

进入：

```text
Settings → Actions → General → Workflow permissions
```

选择：

```text
Read and write permissions
```

保存。

## 四、第一次运行

进入：

```text
Actions → ICE执法自动抓取发布 → Run workflow
```

第一次默认最多处理最近 8 条，避免一次导入太多历史内容。

成功后检查：

```text
https://new.trrb.net/topic/ice/
```

以及首页的“ICE执法”卡片。

## 五、自动运行时间

工作流按纽约时间每天运行四次：

```text
06:17
11:17
16:17
21:17
```

选在整点后的第17分钟，是为了减少 GitHub Actions 整点拥堵。

## 六、自动发布与待审核

正常自动发布必须满足：

- 来源为 `@ICEgov`；
- 有明确文字事实；
- AI可信度达到80；
- 不出现来源中没有的数字；
- 法律状态用词与来源匹配；
- 不含煽动性或主观词语。

不能安全发布的内容保存在：

```text
data/ice-pending.json
```

程序不会把这些异常内容显示在网站上。

## 七、文章地址

文章自动生成为：

```text
/news/ice/YYYY/MM/DD/ice-X帖子ID.html
```

所有文章统一显示在：

```text
/topic/ice/
```

## 八、切换正式域名

当正式站点从 `new.trrb.net` 切换为 `trrb.net` 后，把工作流中的：

```yaml
SITE_URL: "https://new.trrb.net"
```

改为：

```yaml
SITE_URL: "https://trrb.net"
```

同时修改 `topic/ice/index.html` 中的 canonical 地址。

## 九、常见错误

### X API 401

`X_BEARER_TOKEN` 错误、过期或没有读取搜索接口的权限。

### X API 402/403

当前 X API 项目额度或接口访问级别不支持 Recent Search。

### OpenAI 401

`OPENAI_API_KEY` 错误或未加入唐人日报仓库。

### 工作流成功但没有新文章

可能是：

- `@ICEgov` 没有新帖子；
- 帖子已处理过；
- 内容被写入 `data/ice-pending.json`；
- 内容只有图片或事实不足，未通过自动发布校验。

### Git push 被拒绝

确认 Workflow permissions 已设置为 Read and write permissions。
