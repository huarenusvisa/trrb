exports.handler = async(event)=>{

if(event.httpMethod!=="POST"){
return {statusCode:405,body:"Method not allowed"};
}

const body=JSON.parse(event.body||"{}");

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;

const response=await fetch(
`${url}/rest/v1/ice_user_reports`,
{
method:"POST",
headers:{
apikey:key,
Authorization:`Bearer ${key}`,
"Content-Type":"application/json"
},
body:JSON.stringify(body)
});

return {
statusCode:response.ok?200:500,
body:JSON.stringify({
success:response.ok
})
};

};
