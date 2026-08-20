// TRRB V31 unified channel configuration
// “重要新闻”不再作为独立频道；首页使用“今日要闻”自动推荐池。

window.TRRB_CHANNELS = [
  { name: "热门头条", slug: "hot", priority: 1, enabled: true },
  { name: "美国时政", slug: "politics", priority: 2, enabled: true },
  { name: "美国警情", slug: "crime", priority: 3, enabled: true },
  { name: "移民法官通过率", slug: "immigration-judge-approval-rate", priority: 4, enabled: true },
  { name: "移民美国", slug: "immigration", priority: 5, enabled: true },
  { name: "ICE执法动态", slug: "ice", priority: 6, enabled: true },
  { name: "曝光墙", slug: "expose", priority: 7, enabled: true }
];
