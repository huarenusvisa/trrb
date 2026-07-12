# 唐人日报：两个独立实时板块

包含：

- `/ice/`：ICE执法追踪
- `/election/`：2026中期选举实时动态
- `/assets/styles.css`：两个板块共用样式
- `/assets/app.js`：数据加载和交互
- `/data/ice.json`：ICE示例数据
- `/data/election.json`：选举示例数据

## 部署

把压缩包解压后，将全部文件复制到你网站项目根目录，再提交到 GitHub。Netlify 会自动部署。

页面地址：

- `https://trrb.net/ice/`
- `https://trrb.net/election/`

## 接入你的真实接口

在页面加载 `app.js` 之前设置：

```html
<script>
window.TRRB_ICE_API = "/api/ice-feed";
window.TRRB_ELECTION_API = "/api/election-feed";
</script>
```

接口返回格式参考 `/data/ice.json` 和 `/data/election.json`。

## 首页专题卡链接

- ICE 卡片：`/ice/`
- 2026中期选举卡片：`/election/`

## 注意

地图为轻量示意图，不依赖第三方地图服务。后续需要真实州级边界和聚合点，可替换为 Mapbox、Leaflet 或现有地图组件。
