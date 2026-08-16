# 第十六轮人工推进控制

当前采用人工推进，不降低任何验收标准。

顺序：
1. 先确认节点9生产验收明确 PASS。
2. 节点9未 PASS 时仅修复真实生产差距，不改宽验收标准。
3. 节点9 PASS 后手动运行 `.github/workflows/round16-node10-final-production-audit.yml`。
4. 节点10必须重新运行节点1—9。
5. 只有日志明确出现 `ROUND16 NODE10 PASS: final end-to-end production acceptance verified` 与 `ROUND 16: 10/10 PASS` 才正式关闭第十六轮。

Google Search Console / Bing Webmaster 账户级 API 授权另行处理，不作为第十六轮降低验收门槛的理由。
