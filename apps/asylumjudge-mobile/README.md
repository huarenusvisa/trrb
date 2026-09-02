# AsylumJudge Mobile

独立的 iOS、Android 与 Web Expo 应用，使用现有 AsylumJudge/EOIR 数据接口。它与唐人日报 App 使用不同的包名和构建配置，不会相互覆盖。

## 第一阶段功能

- 法官姓名、法院、城市搜索
- 法官审理总量、批准率、拒绝率及年度数据
- 法院工作量与州别筛选
- 国籍统计查询
- 数据来源、统计口径和法律免责声明

批准率采用 `批准数 / (批准数 + 拒绝数)` 的实体裁决口径；样本较少时必须结合案件结构理解，不能作为个案结果预测。

## 本地运行

```bash
npm install
npm run start
```

发布 EAS 项目前，需先由项目所有者创建独立的 EAS Project ID，再写入 `app.json`；本仓库不会复用唐人日报的 Project ID。
