/**
 * ICE 实时执法过滤器
 * v36
 *
 * 规则：
 * 只显示网站上线之后的数据
 * 历史数据全部忽略
 */


async function filterICEData(data){


    let config;


    try{

        const response =
        await fetch(
            "/data/ice-config.json?v="+Date.now()
        );


        config =
        await response.json();


    }catch(error){


        console.warn(
            "ICE config missing",
            error
        );


        return [];


    }



    const startTime =
    new Date(
        config.startTime
    );



    const result =
    data.filter(item=>{


        const itemTime =
        new Date(

            item.created_at ||
            item.time ||
            item.date ||
            0

        );



        return (
            itemTime >= startTime
        );


    });



    return result;


}



/**
 * ICE统计
 */

function getICEStats(data){


    const now =
    new Date();



    const today =
    new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );



    const todayData =
    data.filter(item=>{


        const t =
        new Date(
            item.time ||
            item.created_at ||
            item.date
        );


        return t>=today;


    });



    return {


        people:
        todayData.reduce(
            (sum,item)=>{

                return sum +
                Number(
                    item.arrests ||
                    item.people ||
                    0
                );

            },
            0
        ),



        locations:
        [
            ...new Set(
                todayData
                .map(
                    x=>x.location
                )
                .filter(Boolean)
            )
        ].length,



        newsCount:
        todayData.length



    };


}



/**
 * ICE新闻过滤
 */

function filterICEArticle(article){


    return filterICEData(
        [article]
    )
    .then(
        result=>
        result.length>0
    );


}
