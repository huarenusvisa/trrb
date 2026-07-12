async function loadTopicFeed(){

    let data=[];

    try{

        const res = await fetch(
            "/data/topic-feed.json?v="+Date.now()
        );

        data = await res.json();

    }catch(e){

        console.log("topic feed loading error",e);

    }


    window.TRRB_TOPIC_DATA=data;


    renderTopicLatest(data);

}



function renderTopicLatest(data){


    const boxes=document.querySelectorAll(
        "[data-topic-latest]"
    );


    boxes.forEach(box=>{


        const topic=
        box.dataset.topicLatest;


        const item=data.find(
            x=>x.topic===topic
        );


        if(!item){

            box.innerHTML="暂无最新动态";

            return;

        }



        let title=item.title || "";



        //特朗普特殊处理

        if(topic==="trump"
        && window.generateTrumpTitle){


            title=
            window.generateTrumpTitle(
                item.content || title
            );

        }



        //中期选举

        if(topic==="election"
        && window.generateElectionTitle){


            title=
            window.generateElectionTitle(
                item.content || title
            );

        }



        box.innerHTML=`

        <strong>
        ${title}
        </strong>

        <p>
        ${item.summary || ""}
        </p>

        `;


    });


}




document.addEventListener(
"DOMContentLoaded",
loadTopicFeed
);
