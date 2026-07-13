document.addEventListener("DOMContentLoaded",()=>{

const btn=document.getElementById("report-btn");
const modal=document.getElementById("report-modal");

if(!btn||!modal)return;

btn.onclick=()=>{
 modal.classList.remove("hidden");
 document.getElementById("report-date").value =
 new Date().toISOString().slice(0,10);
};

document.getElementById("close-report").onclick=()=>{
 modal.classList.add("hidden");
};

document.getElementById("submit-report").onclick=async()=>{

const payload={
 report_date:document.getElementById("report-date").value,
 location_text:document.getElementById("report-location").value,
 event_description:document.getElementById("report-content").value,
 status:"draft"
};

const res=await fetch("/.netlify/functions/submit-ice-report",{
 method:"POST",
 headers:{
 "Content-Type":"application/json"
 },
 body:JSON.stringify(payload)
});

if(res.ok){
 alert("提交成功，编辑审核后发布");
 modal.classList.add("hidden");
}else{
 alert("提交失败");
}

};

});
