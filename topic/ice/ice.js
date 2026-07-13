let ICE_START_TIME = null;
let ICE_DATA = [];


// =========================
// 加载上线时间
// =========================

async function loadICEConfig(){

    try{

        const res =
        await fetch(
            "./ice-config.json?v=" + Date.now()
        );


        const config =
        await res.json();


        ICE_START_TIME =
        new Date(
            config.startTime
        );


    }catch(e){

        console.error(
            "ICE config error",
            e
        );


        ICE_START_TIME =
        new Date();

    }

}



// =========================
// 过滤上线以前数据
// =========================

function filterICEData(data){


    if(!ICE_START_TIME){
        return [];
    }


    return data.filter(item=>{


        const itemTime =
        new Date(

            item.time ||
            item.created_at ||
            item.date ||
            0

        );


        return (
            itemTime >= ICE_START_TIME
        );


    });


}



// =========================
// 顶部统计
// =========================

function updateICEStats(data){


    const list =
    filterICEData(data);



    let people = 0;


    list.forEach(item=>{


        people += Number(

            item.people ||
            item.arrests ||
            item.count ||
            0

        );


    });



    const locations =
    [
        ...new Set(

            list
            .map(
                x=>x.location
            )
            .filter(Boolean)

        )
    ];



    const peopleBox =
    document.getElementById(
        "today-count"
    );


    const placeBox =
    document.getElementById(
        "today-places"
    );



    if(peopleBox){

        peopleBox.innerHTML =
        people + "人";

    }



    if(placeBox){

        placeBox.innerHTML =
        locations.length + "处";

    }


}



// =========================
// 新闻列表
// =========================

function renderICENews(data){


    const box =
    document.getElementById(
        "ice-news-list"
    );


    if(!box){
        return;
    }



    const list =
    filterICEData(data);



    if(list.length===0){


        box.innerHTML =
        `
        <article class="ice-news-item">
        <h3>暂无最新ICE执法动态</h3>
        <p>系统已从上线时间开始实时追踪。</p>
        </article>
        `;


        return;

    }




    box.innerHTML =
    list.map(item=>{


        return `

        <article class="ice-news-item">


        <h3>
        ${item.title || "ICE执法行动"}
        </h3>


        <p>
        ${item.summary || ""}
        </p>


        <small>
        来源：
        ${item.source || "ICE"}
        </small>


        </article>

        `;


    }).join("");

}



// =========================
// 初始化
// =========================

async function loadICE(){


    await loadICEConfig();



    try{


        const res =
        await fetch(
            "/data/ice-data.json?v="+Date.now()
        );


        ICE_DATA =
        await res.json();



    }catch(e){


        console.error(
            "ICE data error",
            e
        );


        ICE_DATA=[];

    }




    updateICEStats(
        ICE_DATA
    );


    renderICENews(
        ICE_DATA
    );


}



document.addEventListener(
"DOMContentLoaded",
loadICE
);
