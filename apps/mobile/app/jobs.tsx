import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

type Job={id:string;title:string;description?:string;category_slug?:string;employment_type?:string;salary_min?:number;salary_max?:number;salary_period?:string;state_code:string;city:string;borough?:string;neighborhood?:string;status:string};
type LocationFilter={label:string;state_code?:string;city?:string;borough?:string;neighborhood?:string};
const ENDPOINT='https://trrb.net/.netlify/functions/public-jobs';
const aliases:Record<string,LocationFilter>={
  '纽约法拉盛':{label:'纽约法拉盛',state_code:'NY',city:'Flushing',borough:'Queens',neighborhood:'Flushing'},
  '法拉盛':{label:'纽约法拉盛',state_code:'NY',city:'Flushing',borough:'Queens',neighborhood:'Flushing'},
  'flushing ny':{label:'Flushing, NY',state_code:'NY',city:'Flushing'},
  '纽约':{label:'纽约',state_code:'NY',city:'New York'},
  'new york ny':{label:'New York, NY',state_code:'NY',city:'New York'},
  '威斯康星麦迪逊':{label:'威斯康星麦迪逊',state_code:'WI',city:'Madison'},
  '麦迪逊':{label:'威斯康星麦迪逊',state_code:'WI',city:'Madison'},
  'madison wi':{label:'Madison, WI',state_code:'WI',city:'Madison'},
  '洛杉矶':{label:'洛杉矶',state_code:'CA',city:'Los Angeles'},
  'los angeles ca':{label:'Los Angeles, CA',state_code:'CA',city:'Los Angeles'},
  '旧金山':{label:'旧金山',state_code:'CA',city:'San Francisco'},
  'san francisco ca':{label:'San Francisco, CA',state_code:'CA',city:'San Francisco'}
};
const stateAliases:Record<string,string>={'纽约':'NY','纽约州':'NY','加州':'CA','加利福尼亚':'CA','威斯康星':'WI','威斯康星州':'WI','新泽西':'NJ','新泽西州':'NJ','德州':'TX','得州':'TX','佛州':'FL','佛罗里达':'FL','宾州':'PA','宾夕法尼亚':'PA'};
function resolveLocation(raw:string):LocationFilter|null{
  const text=raw.trim();if(!text)return null;
  const key=text.toLowerCase().replace(/[，,]+/g,' ').replace(/\s+/g,' ').trim();
  if(aliases[key])return aliases[key];
  const en=key.match(/^(.+?)\s+([a-z]{2})$/i);
  if(en)return{label:text,state_code:en[2].toUpperCase(),city:en[1].replace(/\b\w/g,c=>c.toUpperCase())};
  for(const [name,code] of Object.entries(stateAliases))if(text===name)return{label:name,state_code:code};
  return null;
}
function salary(job:Job){const period:Record<string,string>={hour:'/小时',day:'/天',week:'/周',month:'/月',year:'/年',job:'/项目'};const unit=period[job.salary_period||'']||'';if(job.salary_min&&job.salary_max)return `$${job.salary_min}-${job.salary_max}${unit}`;if(job.salary_min)return `$${job.salary_min}+${unit}`;if(job.salary_max)return `最高$${job.salary_max}${unit}`;return '薪资面议'}
export default function JobsScreen(){
  const [items,setItems]=useState<Job[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [locationText,setLocationText]=useState('');const [location,setLocation]=useState<LocationFilter|null>(null);const [locationStatus,setLocationStatus]=useState('');
  const url=useMemo(()=>{const q=new URLSearchParams({limit:'40',sort:'blue_collar'});if(location?.state_code)q.set('state_code',location.state_code);if(location?.city)q.set('city',location.city);if(location?.borough)q.set('borough',location.borough);if(location?.neighborhood)q.set('neighborhood',location.neighborhood);return `${ENDPOINT}?${q.toString()}`},[location]);
  const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await fetch(url,{headers:{Accept:'application/json'}});const p=await r.json();if(!r.ok)throw new Error(p?.error||`HTTP ${r.status}`);setItems(Array.isArray(p?.items)?p.items:[])}catch(e){setError(e instanceof Error?e.message:'加载失败')}finally{setLoading(false)}},[url]);
  useEffect(()=>{load()},[load]);
  const applyLocation=()=>{const resolved=resolveLocation(locationText);if(!locationText.trim()){setLocation(null);setLocationStatus('已显示全美岗位');return}if(!resolved){setLocationStatus('暂时没有识别这个地点，可输入“纽约法拉盛”“威斯康星麦迪逊”或“Madison WI”。');return}setLocation(resolved);setLocationStatus(`正在查看：${resolved.label}`)};
  return <SafeAreaView style={s.page}><View style={s.header}><Text style={s.title}>美国招聘求职</Text><Text style={s.sub}>先看工作：优先展示餐饮、装修、物流仓库、司机、零售、美业和家政护理等华人高频岗位</Text><View style={s.locationRow}><TextInput value={locationText} onChangeText={setLocationText} onSubmitEditing={applyLocation} placeholder="输入工作地点，如纽约法拉盛" autoCapitalize="words" style={s.locationInput}/><Pressable onPress={applyLocation} style={s.locationButton}><Text style={s.locationButtonText}>找附近工作</Text></Pressable></View>{locationStatus?<Text style={s.locationStatus}>{locationStatus}</Text>:null}</View>{loading?<ActivityIndicator/>:error?<View><Text style={s.error}>{error}</Text><Pressable onPress={load}><Text>重试</Text></Pressable></View>:<FlatList data={items} keyExtractor={x=>x.id} onRefresh={load} refreshing={loading} renderItem={({item})=><View style={s.card}><Text style={s.jobTitle}>{item.title}</Text><Text>{[item.neighborhood,item.borough,item.city,item.state_code].filter(Boolean).join(' · ')}</Text><Text style={s.salary}>{salary(item)}</Text><Text numberOfLines={3}>{item.description||''}</Text><Text style={s.id}>岗位ID {item.id}</Text></View>} ListEmptyComponent={<Text>这个地点暂时没有当前招聘，可以清空地点查看全美岗位。</Text>}/>}</SafeAreaView>}
const s=StyleSheet.create({page:{flex:1,padding:16},header:{marginBottom:16},title:{fontSize:26,fontWeight:'700'},sub:{marginTop:4},locationRow:{flexDirection:'row',gap:8,marginTop:14},locationInput:{flex:1,borderWidth:StyleSheet.hairlineWidth,borderRadius:10,paddingHorizontal:12,paddingVertical:10},locationButton:{justifyContent:'center',paddingHorizontal:13,borderRadius:10,backgroundColor:'#111827'},locationButtonText:{color:'#fff',fontWeight:'700'},locationStatus:{marginTop:7,fontSize:12},card:{paddingVertical:14,borderBottomWidth:StyleSheet.hairlineWidth},jobTitle:{fontSize:18,fontWeight:'600',marginBottom:6},salary:{fontWeight:'700',marginTop:4},id:{fontSize:11,marginTop:8},error:{marginBottom:8}});
