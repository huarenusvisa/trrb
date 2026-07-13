function generateElectionTitle(content){

if(!content){
return "2026中期选举最新选情变化";
}


const states=[
["宾州","宾州选情"],
["佐治亚","佐治亚选情"],
["亚利桑那","亚利桑那选情"],
["密歇根","密歇根选情"],
["威斯康星","威斯康星选情"],
["内华达","内华达选情"]
];


const actions=[
["领先","支持率变化"],
["民调","民调出现变化"],
["竞选","竞选争夺升级"],
["翻转","席位争夺升温"],
["支持","阵营支持变化"]
];


let state="";


for(const s of states){

if(content.includes(s[0])){
state=s[1];
break;
}

}



for(const a of actions){

if(content.includes(a[0])){

return `${state || "中期选举"}${a[1]}`;

}

}



if(content.includes("共和党")){

return "共和党关键州争夺升级";

}



if(content.includes("民主党")){

return "民主党调整中期选举策略";

}



return "2026中期选举竞争升温";

}
