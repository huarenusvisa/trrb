# 第十五轮——美国司法与新规数据库

本轮目标：把唐人日报从“报道美国法律新闻”升级为“持续、可追溯、免费的中文美国司法与新规数据库”。

## 固定10个节点（名称与顺序锁定）

1. 美国最高法院判决自动采集
2. 13个联邦巡回上诉法院判决自动采集
3. BIA先例裁决自动采集
4. 白宫行政命令自动采集
5. Federal Register新规 / Final Rule自动采集
6. 判例与新规统一数据库、去重及版本控制
7. AI中文裁判要旨、法律问题与影响范围解析
8. “美国判例与新规”前台栏目及检索筛选系统
9. 重大裁决自动识别并进入唐人日报新闻生产线
10. 全链路实时更新与生产总验收

本轮内不得改名、不得调换顺序。节点只有在有真实官方源、自动任务和验收证据时才能记为 PASS。

## 内容分层规则

### A. 法律数据库层
所有符合条件的公开判决、先例裁决、行政命令和正式规则进入数据库，不因其是否“重大”而丢弃。

每条记录至少保留：
- issuing_body / 发布机构
- source_type / 文书类型
- case_or_document_name / 案名或文件名
- docket_or_document_number / 案号或文件编号
- official_citation / 官方引证（如存在）
- publication_date / 发布日期
- official_url / 官方网页
- official_pdf_url / 官方PDF（如存在）
- precedential_status / 先例或发表状态（如适用）
- jurisdiction / 管辖范围
- source_hash / 原文指纹
- source_version / 原文版本

### B. 新闻层
只有经过影响力判断的重大裁决或重大新规，才进入唐人日报普通新闻生产线。数据库收录不等于首页新闻发布。

## 官方来源规则

优先且默认只采集第一方政府/法院来源：
- Supreme Court of the United States：supremecourt.gov
- 联邦巡回上诉法院：各uscourts.gov官方法院站点；GovInfo USCOURTS作为官方补充/兜底
- BIA / AG precedent：justice.gov/eoir
- Executive Orders：White House官方发布 + Federal Register / GovInfo核对
- Federal Register rules：FederalRegister.gov开发者API；法律效力核对指向GovInfo官方版本

不得把 Westlaw、Lexis、商业法律媒体的编辑摘要、headnotes、Key Numbers 作为原始数据复制进入数据库。

## BIA边界

“BIA自动采集”默认指 DOJ/EOIR 公开的 precedential / published decisions。不得把该栏目描述成“BIA全部案件裁决”，因为未发表个案并非全部公开进入该先例库。

## Federal Register访问规则

程序化访问优先使用 FederalRegister.gov 官方开发者API，不对网页做高频页面抓取。保存 document_number、type、publication_date、agencies、html_url、pdf_url、effective_on 等官方元数据。

## 展示命名

前台总栏目固定建议名：**美国判例与新规**。

一级筛选：
- 最高法院
- 巡回法院
- BIA裁决
- 行政命令
- Federal Register新规

法律数据库页面与普通新闻页面分开，避免每天大量判决淹没新闻首页。

## 中文解析规则

AI生成的中文内容必须明确属于“中文摘要/要旨”，不得伪装成法院原文。每页必须保留官方原文入口。

中文解析至少回答：
1. 法院/机构解决了什么问题；
2. 最终结论是什么；
3. 哪些人或地区受影响；
4. 是否属于 precedential / published / final rule；
5. 主要法律条文或前案；
6. 原始官方来源在哪里。

AI不得补造案情、引语、票数、法官观点或生效日期。无法从官方材料确认的字段保持为空或标记待核验。

## 去重与版本规则

同一官方文书不得因HTML、PDF、RSS/API多个入口重复创建记录。优先键顺序：
1. 官方稳定ID / document_number；
2. court + docket + opinion date；
3. official citation；
4. 官方URL归一化；
5. source_hash。

官方文书发生 revision / correction 时保留版本历史，不覆盖历史而不留痕。

## 发布与质量门槛

- 抓取失败不得发布空记录。
- 官方URL/PDF不可验证时不得标为“已核验”。
- 未确认 precedential 状态时不得标为“先例”。
- 重复记录必须在发布前拦截。
- 重大新闻生成必须保留对应法律数据库记录ID和官方来源。
- 不为通过测试改变新闻首页既有内容排序。

## 第十五轮最终验收标准

节点10必须重新验证节点1—9，而不是只读取旧结果。最终只有日志明确输出：

`ROUND 15: 10/10 PASS`

才允许正式关闭第十五轮。
