let ICE_START_TIME = null;
let ICE_DATA = [];


// =========================
// 加载 ICE 上线时间
// =========================

async function loadICEConfig(){

    try{

        const res = await fetch(
            "./ice-config.json?v=" + Date.now()
        );


        const config = await res.json();


        ICE_START_TIME = new Date(
            config.startTime
        );


        console.log(
            "ICE追踪开始:",
            ICE_START_TIME
        );


    }catch(e){

        console.error(
            "ICE config error",
            e
        );


        ICE_START_TIME = new Date();

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


        const time = new Date(

            item.time ||
            item.created_at ||
            item.date ||
            0

        );



        return (
            !isNaN(time) &&
            time >= ICE_START_TIME
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



    const locations = [

        ...new Set(

            list
            .map(
                item=>item.location
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
// ICE新闻列表
// =========================

function renderICENews(data){


    const box =
    document.getElementById(
        "ice-news-list"
    );



    if(!box){

        return;

    }



    let list =
    filterICEData(data);



    // 最新优先

    list.sort(
        (a,b)=>{


            return new Date(

                b.time ||
                b.created_at ||
                0

            )
            -
            new Date(

                a.time ||
                a.created_at ||
                0

            );


        }
    );



    // 没有数据

    if(list.length===0){


        box.innerHTML = `

        <article class="ice-news-item no-image">


            <div class="ice-news-copy">


                <h3>
                暂无最新ICE执法动态
                </h3>


                <p>
                系统已从上线时间开始实时追踪。
                </p>


            </div>


        </article>

        `;


        return;

    }




    box.innerHTML =


    list.map(item=>{


        const hasImage =
        item.image &&
        item.image !== "" &&
        item.image !== "null";



        return `


        <article class="ice-news-item ${hasImage ? "" : "no-image"}">



            ${
                hasImage

                ?

                `
                <img
                class="ice-news-thumb"
                src="${item.image}"
                alt="${item.title || "ICE执法新闻"}"
                loading="lazy"
                >
                `

                :

                ""

            }




            <div class="ice-news-copy">


                <h3>
                ${item.title || "ICE执法行动"}
                </h3>


                <p>
                ${item.summary || ""}
                </p>


            </div>



            <div class="ice-news-source">

                来源：
                ${item.source || "ICE"}

            </div>



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
            "/data/ice-data.json?v=" + Date.now()
        );


        ICE_DATA =
        await res.json();



    }catch(e){


        console.error(
            "ICE data error",
            e
        );


        ICE_DATA = [];


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
