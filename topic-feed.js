async function loadTopicFeed(){

let data=[];

try{

const res=await fetch(
"/data/topic-feed.json?v="+Date.now()
);

data=await res.json();

}catch(e){

console.log(
"topic feed loading error",
e
);

}


window.TRRB_TOPIC_DATA=data;


renderTopicLatest(data);

}



function renderTopicLatest(data){


document
.querySelectorAll("[data-topic-latest]")
.forEach(box=>{


const topic=
box.dataset.topicLatest;


const item=data
.filter(
x=>x.topic===topic
)
.sort(
(a,b)=>
new Date(b.time)-new Date(a.time)
)[0];


if(!item){

box.innerHTML="暂无最新动态";

return;

}



let title=item.title || "";



// Trump

if(
topic==="trump"
&& window.generateTrumpTitle
){

title=
window.generateTrumpTitle(
item.content || title
);

}



// Election

if(
topic==="election"
&& window.generateElectionTitle
){

title=
window.generateElectionTitle(
item.content || title
);

}



// ICE

if(
topic==="ice"
&& window.renderICE
){

box.innerHTML=
window.renderICE(item);

return;

}



box.innerHTML=`

<div class="topic-card">

<h3>
${title}
</h3>


<p>
${item.summary || ""}
</p>


<div class="topic-time">
${item.time || ""}
</div>


<div class="topic-source">
${item.source || ""}
</div>


</div>

`;

});


}



document.addEventListener(
"DOMContentLoaded",
loadTopicFeed
);
