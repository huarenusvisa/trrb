const SUPABASE_URL =
"https://你的supabase地址.supabase.co";


const SUPABASE_KEY =
"你的anon key";


async function request(url,options={}){

const res=await fetch(
SUPABASE_URL+url,
{
...options,
headers:{
apikey:SUPABASE_KEY,
Authorization:
`Bearer ${SUPABASE_KEY}`,
"Content-Type":
"application/json"
}
});

return await res.json();

}



//读取待审核

async function loadReports(){


const data=
await request(
"/rest/v1/ice_user_reports?status=eq.draft&order=created_at.desc"
);


const box=
document.getElementById("list");


if(!data.length){

box.innerHTML=
"<h3>暂无待审核爆料</h3>";

return;

}



box.innerHTML="";


data.forEach(item=>{


let media="";


if(item.media_urls){

item.media_urls.forEach(url=>{


if(
url.includes(".mp4")
||
url.includes(".mov")
){

media+=
`
<video controls src="${url}">
</video>
`;

}

else{

media+=
`
<img src="${url}">
`;

}


});


}



box.innerHTML+=`

<div class="card">


<h2>
${item.location_text || "未知地点"}
</h2>


<div class="item">

日期：
${item.report_date}

</div>


<div class="item">

事件：

${item.event_description || "无"}

</div>


<div class="media">

${media}

</div>


<button
class="publish"
onclick="publishReport('${item.id}')">

发布

</button>



<button
class="reject"
onclick="rejectReport('${item.id}')">

拒绝

</button>


</div>


`;


});


}





//发布

async function publishReport(id){


await request(
"/rest/v1/ice_user_reports?id=eq."+id,
{

method:"PATCH",

body:JSON.stringify({

status:"published",

review_time:
new Date().toISOString()

})

});


alert("已发布");

loadReports();


}




//拒绝

async function rejectReport(id){


await request(
"/rest/v1/ice_user_reports?id=eq."+id,
{

method:"PATCH",

body:JSON.stringify({

status:"rejected",

review_time:
new Date().toISOString()

})

});


alert("已拒绝");


loadReports();


}




loadReports();
