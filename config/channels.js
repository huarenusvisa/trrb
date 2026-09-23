// TRRB V31 unified channel configuration
// “重要新闻”不再作为独立频道；首页使用“今日要闻”自动推荐池。

window.TRRB_CHANNELS = [
  { name: "中国热门头条", slug: "hot-headlines", priority: 1, enabled: true },
  { name: "美国时政", slug: "us-politics", priority: 2, enabled: true },
  { name: "ICE执法与警情", slug: "iceandpolice", priority: 3, enabled: true },
  { name: "中国政治", slug: "china-politics", priority: 4, enabled: true },
  { name: "移民法官通过率", slug: "immigration-judge-approval-rate", priority: 5, enabled: true },
  { name: "曝光墙", slug: "expose", priority: 6, enabled: true }
];
