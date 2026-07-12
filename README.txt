唐人日报 ICE 地图最终整合补丁 v42

直接按原路径覆盖以下三个文件：
1. topic/ice/index.html
2. assets/ice-topic.css
3. assets/ice-topic.js

不需要手动添加任何 link 或 script。
不需要执行 SQL。
不需要增加保底文件。

最终效果：
- 保留顶部 ICE 标题和今日数据；
- 地图区域只显示美国地图；
- 删除地图标题、说明、24小时/7天/30天、事件类型筛选；
- 删除热点州排名、地图底部说明和按钮；
- 删除地图下方四张统计卡；
- 保留下方“最新动态”；
- 移动端地图高度 330px，桌面端 460px；
- 资源版本统一升级为 v42，避免继续读取旧缓存。

GitHub 提交说明：
Finalize compact ICE map v42
