import assert from "node:assert/strict";
import classifier from "../netlify/functions/_shared/china-hot-headlines.js";

const { isChinaHotCategory, isChinaHotHeadline, displayCategoryName } = classifier;

assert.equal(isChinaHotHeadline("重庆大足区原副区长钱虎被双开", "重庆市纪委监委发布通报"), true);
assert.equal(isChinaHotHeadline("健身房瑜伽垫暗藏风险？武汉女子感染HPV", "事件发生在湖北武汉"), true);
assert.equal(isChinaHotHeadline("辛辛那提非法移民因芬太尼案被定罪", "美国联邦法院公布裁决"), false);
assert.equal(isChinaHotHeadline("佛罗里达警长联系ICE拘留嫌疑人", "事件发生在美国"), false);
assert.equal(isChinaHotHeadline("美国FBI调查涉华间谍案", "嫌疑人被指与中国有关"), false);
assert.equal(isChinaHotHeadline("中国回应美国最新出口限制", "商务部举行例行发布会"), true);
assert.equal(displayCategoryName("热门头条"), "中国热门头条");
assert.equal(isChinaHotCategory("中国热门头条"), true);

console.log("China hot-headline category is restricted to China-primary news");
