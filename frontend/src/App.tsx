import { useEffect, useMemo, useRef, useState } from "react";
import { auth, firebaseReady, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { FOOTER_GROUPS, resolveSitePage, SITE_PATHS, SitePageView, type SitePageId } from "./sitePages";
import "./intelligence.css";
import { WeatherChannelLayout, WeatherChannelPage, type WeatherChannelMode } from "./WeatherChannelReference";
import "./weather-reference.css";

const API=import.meta.env.VITE_API_BASE_URL||"https://earthweather-api.onrender.com";
type Current={time?:string|number;is_day?:number;temperature_2m?:number;relative_humidity_2m?:number;apparent_temperature?:number;precipitation?:number;cloud_cover?:number;pressure_msl?:number;wind_speed_10m?:number;wind_direction_10m?:number;weather_code?:number;source?:string;source_url?:string};
type Place={name:string;region:string;lat:number;lon:number;country?:string;country_code?:string;state?:string;district?:string;accuracy?:number;source?: "gps"|"search";current?:Current;loading?:boolean;error?:boolean};
type Storm={id:string;title:string;description?:string;link?:string;coordinates?:{lat:number;lon:number;date?:string}[]};
type Story={title:string;url:string;source:string;published_at?:string;language?:string;image?:string;description?:string};
const CITIES:Place[]=[
{name:"New Delhi",region:"India",lat:28.6139,lon:77.209},{name:"Chennai",region:"India",lat:13.0827,lon:80.2707},
{name:"Mumbai",region:"India",lat:19.076,lon:72.8777},{name:"London",region:"United Kingdom",lat:51.5072,lon:-0.1276},
{name:"New York",region:"United States",lat:40.7128,lon:-74.006},{name:"Tokyo",region:"Japan",lat:35.6762,lon:139.6503},
{name:"Dubai",region:"UAE",lat:25.2048,lon:55.2708},{name:"Sydney",region:"Australia",lat:-33.8688,lon:151.2093},
{name:"Singapore",region:"Singapore",lat:1.3521,lon:103.8198},{name:"Cape Town",region:"South Africa",lat:-33.9249,lon:18.4241},
{name:"São Paulo",region:"Brazil",lat:-23.5505,lon:-46.6333},{name:"Erode",region:"Tamil Nadu, India",lat:11.341,lon:77.7172}
];

const TOP_CITIES_BY_COUNTRY:Record<string,Place[]> = {
 IN:[
  {name:"New Delhi",region:"Delhi, India",country:"India",country_code:"IN",state:"Delhi",lat:28.6139,lon:77.209},
  {name:"Kolkata",region:"West Bengal, India",country:"India",country_code:"IN",state:"West Bengal",lat:22.5726,lon:88.3639},
  {name:"Mumbai",region:"Maharashtra, India",country:"India",country_code:"IN",state:"Maharashtra",lat:19.076,lon:72.8777},
  {name:"Chennai",region:"Tamil Nadu, India",country:"India",country_code:"IN",state:"Tamil Nadu",lat:13.0827,lon:80.2707},
  {name:"Lucknow",region:"Uttar Pradesh, India",country:"India",country_code:"IN",state:"Uttar Pradesh",lat:26.8467,lon:80.9462}
 ],
 US:[
  {name:"New York",region:"New York, United States",country:"United States",country_code:"US",lat:40.7128,lon:-74.006},
  {name:"Los Angeles",region:"California, United States",country:"United States",country_code:"US",state:"California",lat:34.0522,lon:-118.2437},
  {name:"Chicago",region:"Illinois, United States",country:"United States",country_code:"US",state:"Illinois",lat:41.8781,lon:-87.6298},
  {name:"Houston",region:"Texas, United States",country:"United States",country_code:"US",state:"Texas",lat:29.7604,lon:-95.3698},
  {name:"San Francisco",region:"California, United States",country:"United States",country_code:"US",state:"California",lat:37.7749,lon:-122.4194}
 ],
 GB:[
  {name:"London",region:"England, United Kingdom",country:"United Kingdom",country_code:"GB",state:"England",lat:51.5072,lon:-0.1276},
  {name:"Manchester",region:"England, United Kingdom",country:"United Kingdom",country_code:"GB",state:"England",lat:53.4808,lon:-2.2426},
  {name:"Birmingham",region:"England, United Kingdom",country:"United Kingdom",country_code:"GB",state:"England",lat:52.4862,lon:-1.8904},
  {name:"Glasgow",region:"Scotland, United Kingdom",country:"United Kingdom",country_code:"GB",state:"Scotland",lat:55.8642,lon:-4.2518},
  {name:"Liverpool",region:"England, United Kingdom",country:"United Kingdom",country_code:"GB",state:"England",lat:53.4084,lon:-2.9916}
 ],
 AE:[
  {name:"Dubai",region:"United Arab Emirates",country:"United Arab Emirates",country_code:"AE",lat:25.2048,lon:55.2708},
  {name:"Abu Dhabi",region:"United Arab Emirates",country:"United Arab Emirates",country_code:"AE",lat:24.4539,lon:54.3773},
  {name:"Sharjah",region:"United Arab Emirates",country:"United Arab Emirates",country_code:"AE",lat:25.3463,lon:55.4209},
  {name:"Ajman",region:"United Arab Emirates",country:"United Arab Emirates",country_code:"AE",lat:25.4052,lon:55.5136},
  {name:"Al Ain",region:"United Arab Emirates",country:"United Arab Emirates",country_code:"AE",lat:24.1917,lon:55.7606}
 ],
 AU:[
  {name:"Sydney",region:"New South Wales, Australia",country:"Australia",country_code:"AU",state:"New South Wales",lat:-33.8688,lon:151.2093},
  {name:"Melbourne",region:"Victoria, Australia",country:"Australia",country_code:"AU",state:"Victoria",lat:-37.8136,lon:144.9631},
  {name:"Brisbane",region:"Queensland, Australia",country:"Australia",country_code:"AU",state:"Queensland",lat:-27.4698,lon:153.0251},
  {name:"Perth",region:"Western Australia, Australia",country:"Australia",country_code:"AU",state:"Western Australia",lat:-31.9505,lon:115.8605},
  {name:"Adelaide",region:"South Australia, Australia",country:"Australia",country_code:"AU",state:"South Australia",lat:-34.9285,lon:138.6007}
 ],
 SG:[
  {name:"Singapore",region:"Singapore",country:"Singapore",country_code:"SG",lat:1.3521,lon:103.8198}
 ]
};
const WORLD_TOP_CITIES:Place[]=[
 {name:"New York",region:"United States",country:"United States",country_code:"US",lat:40.7128,lon:-74.006},
 {name:"Paris",region:"France",country:"France",country_code:"FR",lat:48.8566,lon:2.3522},
 {name:"London",region:"United Kingdom",country:"United Kingdom",country_code:"GB",lat:51.5072,lon:-0.1276},
 {name:"Tokyo",region:"Japan",country:"Japan",country_code:"JP",lat:35.6762,lon:139.6503},
 {name:"Rome",region:"Italy",country:"Italy",country_code:"IT",lat:41.9028,lon:12.4964},
 {name:"Dubai",region:"United Arab Emirates",country:"United Arab Emirates",country_code:"AE",lat:25.2048,lon:55.2708},
 {name:"Moscow",region:"Russia",country:"Russia",country_code:"RU",lat:55.7558,lon:37.6173},
 {name:"Sydney",region:"Australia",country:"Australia",country_code:"AU",lat:-33.8688,lon:151.2093},
 {name:"Singapore",region:"Singapore",country:"Singapore",country_code:"SG",lat:1.3521,lon:103.8198},
 {name:"Beijing",region:"China",country:"China",country_code:"CN",lat:39.9042,lon:116.4074},
 {name:"Athens",region:"Greece",country:"Greece",country_code:"GR",lat:37.9838,lon:23.7275}
];

const CACHE_PREFIX="earth-weather-v2:";
function readCache<T>(key:string,fallback:T):T{try{const raw=localStorage.getItem(CACHE_PREFIX+key);if(!raw)return fallback;const parsed=JSON.parse(raw);return parsed?.value??fallback;}catch{return fallback;}}
function writeCache<T>(key:string,value:T){try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({value,savedAt:Date.now()}));}catch{/* storage may be unavailable or full */}}
async function fetchBounded(url:string,init:RequestInit={},timeoutMs=14000):Promise<Response>{const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),timeoutMs);try{return await fetch(url,{...init,signal:controller.signal});}finally{window.clearTimeout(timer);}}
const weatherLabel=(c?:number)=>c==null?"Weather update":c===0?"Clear skies":c===1?"Mainly clear":c===2?"Partly cloudy":c===3?"Overcast":[45,48].includes(c)?"Foggy":[51,53,55,56,57].includes(c)?"Drizzle":[61,63,65,66,67,80,81,82].includes(c)?"Rain":[71,73,75,77,85,86].includes(c)?"Snow":[95,96,99].includes(c)?"Thunderstorms":"Variable conditions";
const weatherScene=(c?:number,cloud?:number)=>{
 if(c!=null&&[95,96,99].includes(c))return "scene-thunder";
 if(c!=null&&[71,73,75,77,85,86].includes(c))return "scene-snow";
 if(c!=null&&[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c))return "scene-rain";
 if(c!=null&&[45,48].includes(c))return "scene-fog";
 if((cloud??0)>=85||c===3)return "scene-overcast";
 if((cloud??0)>=25||c===1||c===2)return "scene-partly";
 return "scene-clear";
};
const cloudDensity=(cloud?:number)=>cloud==null?"cloud-medium":cloud>=85?"cloud-heavy":cloud>=65?"cloud-dense":cloud>=30?"cloud-medium":cloud>=10?"cloud-light":"cloud-clear";
const solarPhase=(lat:number,lon:number,time?:string|number,isDay?:number)=>{
 let instant:Date;
 if(typeof time==="number")instant=new Date(time<1e12?time*1000:time);
 else if(typeof time==="string"&&time.trim()){
  const raw=time.trim().replace(" ","T");
  instant=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)?raw:`${raw}Z`);
 }else instant=new Date();
 if(Number.isNaN(instant.getTime()))return isDay===0?"phase-night":isDay===1?"phase-day":"phase-day";
 const day=Math.floor((Date.UTC(instant.getUTCFullYear(),instant.getUTCMonth(),instant.getUTCDate())-Date.UTC(instant.getUTCFullYear(),0,0))/86400000);
 const hour=instant.getUTCHours()+instant.getUTCMinutes()/60+instant.getUTCSeconds()/3600;
 const gamma=2*Math.PI/365*(day-1+(hour-12)/24);
 const equation=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
 const declination=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
 const solarMinutes=((hour*60+equation+4*lon)%1440+1440)%1440;
 const hourAngle=solarMinutes/4-180;
 const latitude=lat*Math.PI/180;
 const elevation=Math.asin(Math.sin(latitude)*Math.sin(declination)+Math.cos(latitude)*Math.cos(declination)*Math.cos(hourAngle))*180/Math.PI;
 if(elevation<-6)return "phase-night";
 if(elevation<9)return hourAngle<0?"phase-dawn":"phase-dusk";
 return "phase-day";
};
const icon=(c?:number)=>c===0?"☀":c===1?"🌤":c===2?"⛅":c===3?"☁":c!=null&&[45,48].includes(c)?"🌫":c!=null&&[95,96,99].includes(c)?"⛈":c!=null&&[71,73,75,77,85,86].includes(c)?"❄":c!=null&&[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c)?"🌧":"—";
const stamp=(s?:string)=>{if(!s)return "—";const d=new Date(s);return Number.isNaN(d.getTime())?"Recently indexed":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});};
const modelTime=(s?:string|number)=>{if(s==null)return "—";const d=typeof s==="number"?new Date(s<1e12?s*1000:s):new Date(s.endsWith("Z")?s:s+"Z");return Number.isNaN(d.getTime())?"—":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});};
const formatMetric=(value?:number)=>typeof value==="number"&&Number.isFinite(value)?String(Number(value.toFixed(1))):"—";
const published=(value?:string)=>{
 if(!value)return "Recently indexed";
 let date=new Date(value);
 if(Number.isNaN(date.getTime()) && /^\d{8}T\d{6}Z?$/.test(value)){
  const raw=value.replace(/Z$/,"");
  const year=Number(raw.slice(0,4)),month=Number(raw.slice(4,6))-1,day=Number(raw.slice(6,8));
  const hour=Number(raw.slice(9,11)),minute=Number(raw.slice(11,13)),second=Number(raw.slice(13,15));
  date=new Date(Date.UTC(year,month,day,hour,minute,second));
 }
 return Number.isNaN(date.getTime())?"Recently indexed":date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
};
type SatelliteLayer={id:string;title:string;formats?:string[];tile_templates?:string[];default_time?:string|null;time_extent?:string|null};
function SatelliteLivePreview({onExplore}:{onExplore:()=>void}){
 const [frames,setFrames]=useState<Array<{time:string;url:string}>>([]);
 const [index,setIndex]=useState(0);
 const [nearRealtime,setNearRealtime]=useState(false);
 const [layerTitle,setLayerTitle]=useState("NASA VIIRS · True colour");
 const [loaded,setLoaded]=useState(false);
 const [failed,setFailed]=useState(false);
 const [checkedAt,setCheckedAt]=useState("");
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   try{
    const response=await fetch(API+"/api/satellites/catalog",{cache:"no-store"});
    if(!response.ok)throw new Error("Satellite catalogue unavailable");
    const data=await response.json();
    const all=(data?.live_imagery?.layers||[]) as SatelliteLayer[];
    const geo=all.find((item:any)=>/(himawari|ahi|geocolor|abi)/i.test(String(item.id)+" "+String(item.title))&&/T.*PT\d+/i.test(item.time_extent||""));
    const chosen:any=geo||all.find((item:any)=>item.id==="VIIRS_SNPP_CorrectedReflectance_TrueColor")||{id:"VIIRS_SNPP_CorrectedReflectance_TrueColor",title:"Suomi-NPP VIIRS · True colour",default_time:new Date().toISOString().slice(0,10),time_extent:""};
    const extent=String(chosen.time_extent||"").split(",").filter(Boolean).pop()||"";
    const parts=extent.split("/");
    const end=new Date(parts.length>1?parts[1]:chosen.default_time||new Date().toISOString());
    let stepMs=86400000;let isSubdaily=false;
    if(parts[2]){const m=parts[2].match(/PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?/i);if(m){stepMs=((Number(m[1]||0)*3600)+(Number(m[2]||0)*60)+Number(m[3]||0))*1000;isSubdaily=stepMs>0&&stepMs<86400000;}}
    if(!Number.isFinite(end.getTime()))throw new Error("No valid satellite acquisition time");
    if(!isSubdaily)stepMs=86400000;
    const next=Array.from({length:6},(_,i)=>{
     const d=new Date(end.getTime()-(5-i)*stepMs);
     const time=isSubdaily?d.toISOString().replace(/\.\d{3}Z$/,"Z"):d.toISOString().slice(0,10);
     const query=new URLSearchParams({SERVICE:"WMS",REQUEST:"GetMap",VERSION:"1.1.1",LAYERS:chosen.id,STYLES:"",SRS:"EPSG:4326",BBOX:"65,5,100,40",WIDTH:"1000",HEIGHT:"650",FORMAT:"image/jpeg",TIME:time});
     return {time:time,url:"https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?"+query.toString()};
    });
    if(active){setFrames(next);setIndex(0);setNearRealtime(isSubdaily);setLayerTitle(chosen.title||chosen.id);setCheckedAt(new Date().toISOString());setFailed(false);setLoaded(false);}
   }catch{
    const today=new Date();const fallback=Array.from({length:6},(_,i)=>{const d=new Date(today.getTime()-(5-i)*86400000);const time=d.toISOString().slice(0,10);const query=new URLSearchParams({SERVICE:"WMS",REQUEST:"GetMap",VERSION:"1.1.1",LAYERS:"VIIRS_SNPP_CorrectedReflectance_TrueColor",STYLES:"",SRS:"EPSG:4326",BBOX:"65,5,100,40",WIDTH:"1000",HEIGHT:"650",FORMAT:"image/jpeg",TIME:time});return {time:time,url:"https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?"+query.toString()};});
    if(active){setFrames(fallback);setIndex(0);setNearRealtime(false);setLayerTitle("Suomi-NPP VIIRS · True colour");setCheckedAt(new Date().toISOString());}
   }
  };
  void load();const refreshTimer=window.setInterval(()=>void load(),10*60*1000);
  return()=>{active=false;window.clearInterval(refreshTimer)};
 },[]);
 useEffect(()=>{if(frames.length<2)return;const timer=window.setInterval(()=>setIndex(i=>(i+1)%frames.length),1800);return()=>window.clearInterval(timer)},[frames]);
 const frame=frames[index];
 const displayTime=frame?.time?new Date(frame.time).toLocaleString("en-IN",{timeZone:"UTC",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}):"Waiting for imagery";
 return <aside className="weather-earth-panel">
  <div className="weather-earth-panel-top"><span className={nearRealtime?"live-pill":"satellite-loop-pill"}><i/> {nearRealtime?"NEAR-REAL-TIME LOOP":"SATELLITE LOOP"}</span><span>NASA GIBS · INDIA</span></div>
  <div className="weather-earth-image weather-earth-animated">{frame&&!failed?<img key={frame.url} src={frame.url} alt={layerTitle+" satellite frame over India, acquisition "+frame.time} loading="lazy" onLoad={()=>setLoaded(true)} onError={()=>{setFailed(true);setLoaded(false)}}/>:<div className="satellite-frame-fallback">Satellite imagery is temporarily unavailable. Try the full satellite viewer.</div>}<div className="satellite-animation-overlay"><span className="satellite-play-indicator"><i/>{loaded?"PLAYING FRAMES":"LOADING SATELLITE"}</span><span>{index+1}/{Math.max(frames.length,1)}</span></div></div>
  <div className="weather-earth-caption"><div><strong>Earth from orbit</strong><span>{layerTitle} · {nearRealtime?"Sub-daily imagery, where available":"Recent daily satellite snapshots"}</span><small>Frame acquisition: {displayTime} · checked {checkedAt?new Date(checkedAt).toLocaleTimeString("en-IN"):"—"}</small></div><button type="button" onClick={onExplore}>Explore satellite intelligence <span>↗</span></button></div>
 </aside>;
}

function SatelliteDashboard(){
 const [layer,setLayer]=useState("VIIRS_SNPP_CorrectedReflectance_TrueColor");
 const [catalog,setCatalog]=useState<any>(null);
 const [catalogError,setCatalogError]=useState("");
 const [region,setRegion]=useState("india");
 const [refresh,setRefresh]=useState(0);
 const [imageError,setImageError]=useState(false);
 const [imageLoaded,setImageLoaded]=useState(false);
 const areas={india:{label:"India & Indian Ocean",bbox:"65,5,100,40"},asia:{label:"Asia-Pacific",bbox:"75,-15,155,55"},world:{label:"Global view",bbox:"-180,-75,180,75"}} as const;
 const area=areas[region as keyof typeof areas]||areas.india;
 const layers:SatelliteLayer[]=(catalog?.live_imagery?.layers||[]) as SatelliteLayer[];
 const imageryLayers=layers.filter(item=>/true.?color|corrected.?reflectance|geocolor|visible/i.test(`${item.id} ${item.title}`)).slice(0,40);
 const fallbackLayers:SatelliteLayer[]=[
  {id:"VIIRS_SNPP_CorrectedReflectance_TrueColor",title:"Suomi-NPP VIIRS · True colour"},
  {id:"MODIS_Terra_CorrectedReflectance_TrueColor",title:"Terra MODIS · True colour"},
  {id:"MODIS_Aqua_CorrectedReflectance_TrueColor",title:"Aqua MODIS · True colour"}
 ];
 const options=imageryLayers.length?imageryLayers:fallbackLayers;
 const selectedMeta=layers.find(item=>item.id===layer);
 const selectedTitle=selectedMeta?.title||options.find(item=>item.id===layer)?.title||layer;
 const imageUrl=`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${encodeURIComponent(layer)}&STYLES=&SRS=EPSG:4326&BBOX=${area.bbox}&WIDTH=1200&HEIGHT=720&FORMAT=image/jpeg`;
 useEffect(()=>{let active=true;fetch(`${API}/api/satellites/catalog`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(d=>{if(active)setCatalog(d)}).catch(e=>{if(active)setCatalogError(e instanceof Error?e.message:"Satellite catalogue unavailable")});return()=>{active=false}},[refresh]);
 useEffect(()=>{setImageError(false);setImageLoaded(false)},[layer,region,refresh]);
 const catalogueTime=selectedMeta?.default_time||"NASA GIBS default valid acquisition time";
 return <main className="news-main satellite-page">
  <div className="news-toolbar"><div><span className="eyebrow">NASA EOSDIS · MULTI-MISSION IMAGERY</span><h1>Satellite Intelligence 2.0</h1><p>Time-aware satellite imagery discovery with mission selection, regional views and verified catalogue metadata.</p></div><button className="refresh-button" onClick={()=>setRefresh(x=>x+1)}>↻ Refresh satellite intelligence</button></div>
  <div className="satellite-status"><span className="satellite-live-dot"/><strong>NASA GIBS WMTS / WMS</strong><strong>{catalog?.live_imagery?.status==="live"||imageLoaded?"CONNECTED":"CHECKING CONNECTION"}</strong><span>{catalog?.live_imagery?.retrieved_layers??"—"} live catalogue layers discovered</span></div>
  <section className="satellite-viewer">
   <div className="satellite-controls">
    <label>Satellite product<select value={layer} onChange={e=>setLayer(e.target.value)}>{options.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <label>Viewing region<select value={region} onChange={e=>setRegion(e.target.value)}><option value="india">India & Indian Ocean</option><option value="asia">Asia-Pacific</option><option value="world">Global view</option></select></label>
   </div>
   <div className="satellite-image-frame">{imageError?<div className="satellite-image-error">Satellite image is temporarily unavailable for this product or region. Try another layer or refresh the catalogue.</div>:<img key={imageUrl} src={imageUrl} alt={`${selectedTitle} satellite imagery over ${area.label}`} onLoad={()=>setImageLoaded(true)} onError={()=>setImageError(true)}/>}<div className="satellite-image-caption"><span>{selectedTitle}</span><span>{area.label}</span><span>Layer time: {catalogueTime}</span></div></div>
   <div className="satellite-image-meta"><span>Source: NASA EOSDIS GIBS · server-selected valid imagery time</span><a href="https://nasa-gibs.github.io/gibs-api-docs/" target="_blank" rel="noreferrer">GIBS documentation ↗</a></div>
  </section>
  <section className="satellite-info-grid"><article><span className="eyebrow">LIVE CATALOGUE METADATA</span><h2>{selectedTitle}</h2><p>{selectedMeta?.time_extent? `Available time range: ${selectedMeta.time_extent}` : "Acquisition dates are product-dependent and may vary with satellite coverage and processing latency."}</p><p>{selectedMeta?.default_time? `Catalogue default acquisition: ${selectedMeta.default_time}` : "The NASA service selects its valid default acquisition when no TIME parameter is supplied."}</p><a href="https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0" target="_blank" rel="noreferrer">Live WMS capabilities ↗</a></article><article><span className="eyebrow">OBSERVATION LIMITATIONS</span><h2>Imagery, not a thermometer</h2><p>True-colour imagery shows clouds, land and ocean appearance. It does not directly provide local air temperature, relative humidity or surface wind. Numerical fields require a separate calibrated retrieval or weather-model dataset.</p></article></section>
  {catalogError&&<p className="feed-note">Satellite catalogue status could not be checked: {catalogError}. The public NASA image endpoint is loaded independently.</p>}
  <p className="feed-note">NASA GIBS imagery availability depends on acquisition, overpass, processing latency, geographic coverage and product-specific time dimensions. This page does not label unconnected missions as live data sources.</p>
 </main>;
}

function SatelliteNumericalReport(){
 const [coords,setCoords]=useState<{lat:number;lon:number}|null>(null);
 const [report,setReport]=useState<any>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [refresh,setRefresh]=useState(0);
 useEffect(()=>{if(!navigator.geolocation){setError("Location access is unavailable. Open Weather Report and search for a location.");return;}navigator.geolocation.getCurrentPosition(p=>setCoords({lat:p.coords.latitude,lon:p.coords.longitude}),()=>setError("Location permission is needed for a point weather report."),{enableHighAccuracy:true,timeout:12000,maximumAge:120000});},[]);
 useEffect(()=>{if(!coords)return;let active=true;const load=()=>{setLoading(true);fetch(`${API}/api/satellite-weather?latitude=${coords.lat}&longitude=${coords.lon}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`API returned ${r.status}`);return r.json()}).then(d=>{if(active){setReport(d);setError("")}}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Weather report unavailable")}).finally(()=>{if(active)setLoading(false)})};load();const timer=window.setInterval(load,5*60*1000);return()=>{active=false;window.clearInterval(timer)}},[coords,refresh]);
 const statusLabel=(p:any)=>p.status==="live"?"LIVE · MODEL ANALYSIS":p.status==="model_analysis"?"MODEL ANALYSIS · NOT SATELLITE":p.status==="satellite_live"?"SATELLITE RETRIEVAL":"SATELLITE DATA PENDING";
 return <main className="news-main satellite-report-page"><div className="news-toolbar"><div><span className="eyebrow">LIVE WEATHER ANALYSIS + SATELLITE PRODUCTS</span><h1>Satellite-Enhanced Weather Report</h1><p>Live temperature, humidity and wind from free weather analysis, with satellite product availability clearly identified.</p></div><button className="refresh-button" onClick={()=>setRefresh(x=>x+1)} disabled={loading}>↻ {loading?"Updating…":"Refresh weather"}</button></div>
 <div className="satellite-report-banner"><strong>LIVE DATA · SOURCE LABELS ENABLED</strong><span>{coords?`Point: ${coords.lat.toFixed(4)}°, ${coords.lon.toFixed(4)}°`:"Waiting for location"}</span></div>
 {loading&&!report&&<p className="feed-note">Connecting to live weather analysis…</p>}{error&&<p className="feed-note">{error}</p>}
 {report&&<><section className="satellite-metric-grid">{report.parameters.map((p:any)=><article className="satellite-metric" key={p.id}><span>{p.label}</span><strong>{p.value==null?"—":typeof p.value==="number"?Number(p.value.toFixed(1)):p.value}{p.value!=null&&<small> {p.unit}</small>}</strong><em className={p.status}>{statusLabel(p)}</em><p>{p.source?.name||p.reason||"No verified provider value returned."}{p.satellite_product&&<><br/>Satellite: {p.satellite_product.name} · {p.satellite_product.status}</>}</p>{p.source?.url&&<a href={p.source.url} target="_blank" rel="noreferrer">Source details ↗</a>}{p.observation_time&&<small>Data time: {modelTime(p.observation_time)}</small>}</article>)}</section>
 <section className="satellite-report-notes"><h2>Data sources and freshness</h2><p>{report.policy}</p><p>API retrieved: {stamp(report.retrieved_at)} · Automatic refresh every 5 minutes.</p><p>Satellite numeric retrievals are only shown as satellite values after a real NASA product extraction succeeds. A model estimate is never relabelled as a satellite observation.</p><small>NASA Earthdata token configured: {report.satellite_data?.credentials_configured?"Yes":"No"}</small></section></>}
 <p className="feed-note">Model-analysis values are useful current-condition estimates, not direct thermometer or anemometer readings. Satellite product availability and latency vary by location and overpass.</p></main>;
}


type ArticleDetail={title:string;description?:string;image?:string|null;paragraphs?:string[];source_url?:string;source?:string;retrieved_at?:string;extraction_status?:string;note?:string};
function WeatherNewsPage({section,location}:{section:"World"|"Country"|"State"|"Local";location:Place|null}){
 const cacheKey=`weather-news:${section}:${location?.country_code||""}:${location?.state||""}:${location?.name||""}`;
 const [stories,setStories]=useState<Story[]>(()=>readCache<Story[]>(cacheKey,[]));
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [updated,setUpdated]=useState("");
 const [selected,setSelected]=useState<Story|null>(null);
 const [article,setArticle]=useState<ArticleDetail|null>(null);
 const [articleLoading,setArticleLoading]=useState(false);
 const [articleError,setArticleError]=useState("");
 const region=section.toLowerCase();
 const title=section==="World"?"World Weather News":section==="Country"?`${location?.country||"Country"} Weather News`:section==="State"?`${location?.state||"State"} Weather News`:`${location?.name||location?.district||"Local"} Weather News`;
 const missingLocation=(section==="Country"&&!location?.country)||(section==="State"&&!location?.state)||(section==="Local"&&!location?.name&&!location?.district);
 const load=async()=>{
  if(missingLocation){setLoading(false);setStories([]);setError("Detecting your location. Allow location access to load country, state and local weather news.");return;}
  setLoading(true);
  const params=new URLSearchParams({region,limit:"40"});
  if(location?.country_code)params.set("country_code",location.country_code);
  if(location?.country)params.set("country_name",location.country);
  if(location?.state)params.set("state_name",location.state);
  if(location?.name)params.set("local_name",location.name);
  if(location?.district)params.set("district_name",location.district);
  try{
   const response=await fetchBounded(`${API}/api/weather-news?${params.toString()}`,{cache:"no-store"},22000);
   if(!response.ok)throw new Error(`News service returned HTTP ${response.status}`);
   const data=await response.json();
   const nextStories=Array.isArray(data.articles)?data.articles:[];
   setStories(nextStories);writeCache(cacheKey,nextStories);
   setUpdated(data.retrieved_at||new Date().toISOString());
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"Weather news is temporarily unavailable.");}
  finally{setLoading(false);}
 };
 useEffect(()=>{setStories(readCache<Story[]>(cacheKey,[]));void load();const id=window.setInterval(()=>void load(),5*60*1000);return()=>window.clearInterval(id)},[section,location?.country_code,location?.country,location?.state,location?.district,location?.name]);
 const openStory=async(story:Story)=>{
  setSelected(story);setArticle(null);setArticleError("");setArticleLoading(true);
  const params=new URLSearchParams({url:story.url,fallback_title:story.title});
  try{
   const response=await fetchBounded(`${API}/api/weather-news/article?${params.toString()}`,{cache:"no-store"},25000);
   if(!response.ok)throw new Error(`Article reader returned HTTP ${response.status}`);
   setArticle(await response.json());
  }catch(e){setArticleError(e instanceof Error?e.message:"The article text could not be loaded. The publisher summary is shown instead.");}
  finally{setArticleLoading(false);}
 };
 useEffect(()=>{if(!selected)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setSelected(null)};window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close)}},[selected]);
 return <main className="news-main weather-news-page">
  <div className="news-toolbar"><div><span className="eyebrow">WEATHER-ONLY NEWS · AUTOMATICALLY UPDATED</span><h1>{title}</h1><p>Recent weather reports, forecasts, cyclones, rainfall, heat, floods and storm developments.</p></div><div className="news-refresh-meta"><span>{updated?`Updated ${stamp(updated)}`:"Checking latest reports…"}</span><button className="refresh-button" onClick={()=>void load()} disabled={loading}>↻ Refresh news</button></div></div>
  {loading&&stories.length===0?<div className="weather-news-grid">{Array.from({length:6},(_,i)=><div className="weather-news-card news-loading-card" key={i}><div className="news-image-skeleton"/><div className="news-card-skeleton-line"/><div className="news-card-skeleton-line short"/></div>)}</div>:null}
  {error&&<div className="empty-report">{error}</div>}
  {!loading&&!error&&stories.length===0?<div className="empty-report">No weather-only articles were found for this area in the latest 24-hour search. New reports are checked automatically.</div>:null}
  <section className="weather-news-grid">
   {stories.map((story,index)=><article className="weather-news-card" key={story.url}>
    <button className="weather-news-open" onClick={()=>void openStory(story)} aria-label={`Read ${story.title}`}>
     <div className="weather-news-image">{story.image?<img src={`${API}/api/weather-news/image?url=${encodeURIComponent(story.image)}`} alt="" loading={index<4?"eager":"lazy"} onError={event=>{event.currentTarget.style.display="none";event.currentTarget.parentElement?.classList.add("image-unavailable")}}/>:<div className="news-image-placeholder"><span>WEATHER REPORT</span><strong>☁</strong></div>}</div>
     <div className="weather-news-copy"><span className="weather-news-meta">{story.source} · {published(story.published_at)}{story.language?` · ${story.language}`:""}</span><h2>{story.title}</h2><span className="weather-news-read">Read on EARTH WEATHER <b>→</b></span></div>
    </button>
   </article>)}
  </section>
  <p className="feed-note">Weather news is sourced from publicly indexed publishers. Images are delivered from the publisher's article metadata. Stories open in EARTH WEATHER's reader with a short excerpt; the original publisher is linked inside the reader.</p>
  {selected&&<div className="news-reader-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null)}}>
   <article className="news-reader" role="dialog" aria-modal="true" aria-label="Weather news article">
    <div className="news-reader-toolbar"><span>EARTH WEATHER · NEWS READER</span><button onClick={()=>setSelected(null)} aria-label="Close article">×</button></div>
    {(article?.image||selected.image)&&<div className="news-reader-hero"><img src={`${API}/api/weather-news/image?url=${encodeURIComponent(article?.image||selected.image||"")}`} alt="" onError={event=>{event.currentTarget.style.display="none"}}/></div>}
    <div className="news-reader-content"><div className="news-reader-meta">{article?.source||selected.source} · {published(selected.published_at)}</div><h1>{article?.title||selected.title}</h1>
     {articleLoading?<div className="article-loading"><div/><div/><div/><div className="short"/></div>:null}
     {articleError?<p className="article-reader-error">{articleError}</p>:null}
     {(article?.description||selected.description)&&<p className="news-reader-description">{article?.description||selected.description}</p>}
     {!articleLoading&&article?.paragraphs?.length?article.paragraphs.map((paragraph,index)=><p className="news-reader-paragraph" key={index}>{paragraph}</p>):null}
     {!articleLoading&&article&&!article.paragraphs?.length&&!article.description?<p className="news-reader-description">The publisher did not expose readable article text to the reader. You can still open the original story below.</p>:null}
     <div className="news-reader-footer"><span>{article?.extraction_status==="publisher_excerpt"?"Publisher excerpt":"Publisher summary / limited text"}</span><a href={article?.source_url||selected.url} target="_blank" rel="noreferrer">Original publisher ↗</a></div>
    </div>
   </article>
  </div>}
 </main>;
}

function ForecastExperience({location}:{location:Place|null}){
 const [data,setData]=useState<any>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  if(!location)return;
  let active=true;
  setLoading(true);setError("");
  fetch(API+"/api/forecast?latitude="+encodeURIComponent(location.lat)+"&longitude="+encodeURIComponent(location.lon)+"&days=7&timezone=auto",{cache:"no-store"})
   .then(r=>{if(!r.ok)throw new Error("Forecast temporarily unavailable");return r.json()})
   .then(payload=>{if(active)setData(payload)})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:"Forecast unavailable")})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[location?.lat,location?.lon,refresh]);
 const hourly=data?.hourly||{};
 const daily=data?.daily||{};
 const hourCount=Math.min(12,Array.isArray(hourly.time)?hourly.time.length:0);
 const dayCount=Math.min(7,Array.isArray(daily.time)?daily.time.length:0);
 const hour=(i:number)=>new Date(hourly.time[i]).toLocaleTimeString([],{hour:"numeric"});
 const day=(i:number)=>new Date(daily.time[i]+"T12:00:00").toLocaleDateString([],{weekday:"short",day:"numeric",month:"short"});
 const number=(v:any)=>typeof v==="number"?Math.round(v):"—";
 const provider=data?.source?.name||data?.source?.provider||"Forecast provider";
 return <section className="wx-forecast-shell" aria-label="Weather forecast">
  <div className="wx-forecast-heading"><div><span className="wx-kicker">PLAN AHEAD</span><h2>Forecast for {location?.name||"your location"}</h2><p>Hourly conditions and the next 7 days</p></div><button onClick={()=>setRefresh(v=>v+1)} disabled={loading}>↻ {loading?"Updating":"Refresh"}</button></div>
  <div className="wx-forecast-source"><span className="wx-source-dot"/><span>{provider}</span><span>{data?.source?.cache_seconds? "· Cached forecast":""}</span><span className="wx-source-status">{data?"FORECAST DATA":"WAITING FOR DATA"}</span></div>
  {loading&&!data&&<div className="wx-forecast-message">Loading forecast…</div>}
  {error&&!data&&<div className="wx-forecast-message">{error}</div>}
  {!location&&<div className="wx-forecast-message">Choose a location to view its forecast.</div>}
  {data&&<><div className="wx-forecast-section" id="hourly-forecast"><div className="wx-subhead"><h3>Hourly forecast</h3><span>Next 12 hours</span></div><div className="wx-hourly-rail">{Array.from({length:hourCount},(_,i)=><article className="wx-hour" key={hourly.time[i]}><span>{i===0?"Now":hour(i)}</span><b>{icon(hourly.weather_code?.[i])}</b><strong>{number(hourly.temperature_2m?.[i])}°</strong><small>{hourly.precipitation_probability?.[i]!=null?number(hourly.precipitation_probability[i])+"% rain":"— rain"}</small><small>{hourly.wind_speed_10m?.[i]!=null?number(hourly.wind_speed_10m[i])+" km/h":"—"}</small></article>)}</div></div>
  <div className="wx-forecast-section" id="ten-day-forecast"><div className="wx-subhead"><h3>7-day forecast</h3><span>Daily outlook</span></div><div className="wx-daily-list">{Array.from({length:dayCount},(_,i)=><article className="wx-day" key={daily.time[i]}><strong>{i===0?"Today":day(i)}</strong><b>{icon(daily.weather_code?.[i])}</b><span>{weatherLabel(daily.weather_code?.[i])}</span><small>Rain {daily.precipitation_sum?.[i]!=null?Number(daily.precipitation_sum[i]).toFixed(1)+" mm":"—"}</small><strong className="wx-day-temps">{number(daily.temperature_2m_max?.[i])}° <i>/</i> {number(daily.temperature_2m_min?.[i])}°</strong></article>)}</div></div></>}
 </section>;
}

export default function App(){
 const [cities,setCities]=useState<Place[]>(()=>readCache<Place[]>("cities",CITIES.map(x=>({...x,loading:true}))));
 const [storms,setStorms]=useState<Storm[]>(()=>readCache<Storm[]>("storms",[]));
  const [updated,setUpdated]=useState<string>(()=>readCache<string>("cities-updated",""));const [busy,setBusy]=useState(false);const [query,setQuery]=useState("");
 const [locationPickerOpen,setLocationPickerOpen]=useState(false);
 const [locationSearchResults,setLocationSearchResults]=useState<Place[]>([]);
 const [locationSearching,setLocationSearching]=useState(false);
 const [locationSelectionPending,setLocationSelectionPending]=useState("");
 const [locationSearchError,setLocationSearchError]=useState("");
 const locationSearchVersion=useRef(0);
const [section,setSection]=useState("Weather Report");const page:"home"|SitePageId=resolveSitePage(window.location.pathname)??"home";const [isSearchLocation,setIsSearchLocation]=useState<boolean>(()=>readCache<Place|null>("local",null)?.source==="search");
 const [user,setUser]=useState<User|null>(null);const [notice,setNotice]=useState("");
 const [notificationsEnabled,setNotificationsEnabled]=useState(()=>{
  try{return typeof window!=="undefined"&&"Notification" in window&&Notification.permission==="granted"&&localStorage.getItem("earth-weather-notifications")==="on";}catch{return false;}
 });
 const notificationRegistration=useRef<ServiceWorkerRegistration|null>(null);
 const [local,setLocal]=useState<Place|null>(()=>readCache<Place|null>("local",null));
 const [visitorLocation,setVisitorLocation]=useState<Place|null>(()=>readCache<Place|null>("visitor-location",null));
 const [personalizedCities,setPersonalizedCities]=useState<boolean>(()=>readCache<boolean>("cities-personalized",false));
 const [locationStatus,setLocationStatus]=useState<"locating"|"ready"|"denied"|"error">(()=>readCache<Place|null>("local",null)?"ready":"locating");
 const [locationMessage,setLocationMessage]=useState(()=>readCache<Place|null>("local",null)?"":"Finding your nearby town or village…");
 const locationStarted=useRef(false);
 const locationRequestVersion=useRef(0);
 const cityRequestVersion=useRef(0);
 useEffect(()=>{
  const cards=Array.from(document.querySelectorAll<HTMLElement>(".weather-scene"));
  if(!cards.length)return;
  if(!("IntersectionObserver" in window)){
   cards.forEach(card=>card.classList.add("weather-anim-active"));
   return;
  }
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    (entry.target as HTMLElement).classList.toggle("weather-anim-active",entry.isIntersecting);
   }
  },{rootMargin:"120px 0px",threshold:0.01});
  cards.forEach(card=>observer.observe(card));
  return()=>observer.disconnect();
 },[section,page,cities,local]);
 useEffect(()=>{if(!auth||!firebaseReady)return;return onAuthStateChanged(auth,setUser)},[]);
 useEffect(()=>{
  if(!("serviceWorker" in navigator))return;
  let active=true;
  void navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"}).then(registration=>{if(active)notificationRegistration.current=registration;}).catch(()=>{});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  if(!("Notification" in window)||!("serviceWorker" in navigator))return;
  let active=true;
  let requesting=false;
  const enableAutomatically=async()=>{
   if(requesting||localStorage.getItem("earth-weather-notifications")==="off")return;
   requesting=true;
   try{
    let permission=Notification.permission;
    if(permission==="default")permission=await Notification.requestPermission();
    if(permission!=="granted")return;
    const registration=notificationRegistration.current||await navigator.serviceWorker.ready;
    if(!active)return;
    notificationRegistration.current=registration;
    setNotificationsEnabled(true);
    localStorage.setItem("earth-weather-notifications","on");
    if(local?.current&&hasValidCurrent(local.current)){
     const current=local.current;
     localStorage.setItem("earth-weather-notification-snapshot",JSON.stringify({temperature:current.temperature_2m,code:current.weather_code,precipitation:current.precipitation||0}));
     await showWeatherNotification(local);
    }
   }catch{/* Permission prompts and notifications may be blocked by browser settings. */}
  };
  const saved=localStorage.getItem("earth-weather-notifications");
  if(saved!=="off"&&Notification.permission==="granted"){
   void enableAutomatically();
  }else if(saved!=="off"&&Notification.permission==="default"){
   // Chromium requires a user gesture before showing the native permission prompt.
   const firstInteraction=()=>{
    window.removeEventListener("pointerdown",firstInteraction);
    window.removeEventListener("keydown",firstInteraction);
    void enableAutomatically();
   };
   window.addEventListener("pointerdown",firstInteraction,{once:true,passive:true});
   window.addEventListener("keydown",firstInteraction,{once:true});
   return()=>{
    active=false;
    window.removeEventListener("pointerdown",firstInteraction);
    window.removeEventListener("keydown",firstInteraction);
   };
  }
  return()=>{active=false;};
 },[]);

 const detectLocalWeather=()=>{
  const requestVersion=++locationRequestVersion.current;
  if(!navigator.geolocation){
   if(!local){setLocationStatus("error");setLocationMessage("Location detection is not supported by this browser.");}
   else{setLocationStatus("ready");setLocationMessage("Showing your last saved location; this browser cannot refresh GPS.");}
   return;
  }
  if(!local)setLocationStatus("locating");
  setLocationMessage(local?"Checking your device location in the background…":"Finding your device location…");
  navigator.geolocation.getCurrentPosition(position=>{
   if(requestVersion!==locationRequestVersion.current)return;
   const lat=position.coords.latitude,lon=position.coords.longitude,accuracy=position.coords.accuracy;
   const sameArea=Boolean(local&&Math.abs(local.lat-lat)<0.01&&Math.abs(local.lon-lon)<0.01);
   const provisional:Place={
    name:sameArea&&local?local.name:"Nearby location",
    region:sameArea&&local?local.region:"GPS coordinates · resolving town or village",
    lat,lon,accuracy,source:"gps",current:sameArea?local?.current:undefined,
    loading:!sameArea||!local?.current,error:false,
   };
   setLocal(provisional);writeCache("local",provisional);
   setIsSearchLocation(false);
   if(!sameArea){setVisitorLocation(null);try{localStorage.removeItem(CACHE_PREFIX+"visitor-location");}catch{/* storage may be unavailable */}}
   setLocationStatus("ready");
   setLocationMessage("Resolving your nearby town or village…");
   const controller=new AbortController();
   const timeout=window.setTimeout(()=>controller.abort(),10000);
   void fetch(`${API}/api/location/reverse?latitude=${lat}&longitude=${lon}`,{cache:"no-store",signal:controller.signal})
    .then(response=>{if(!response.ok)throw new Error("Nearby place service unavailable");return response.json();})
    .then(placeData=>{
     if(requestVersion!==locationRequestVersion.current)return;
     const visitor:Place={name:placeData?.name||"Nearby area",region:placeData?.region||placeData?.country||"GPS location",lat,lon,accuracy,source:"gps",country:placeData?.country||undefined,country_code:placeData?.country_code||undefined,state:placeData?.state||undefined,district:placeData?.district||undefined};
     setLocal(previous=>{
      if(!previous||Math.abs(previous.lat-lat)>0.001||Math.abs(previous.lon-lon)>0.001)return previous;
      const next={...previous,name:visitor.name,region:visitor.region,country:visitor.country,country_code:visitor.country_code,state:visitor.state,district:visitor.district,accuracy};
      writeCache("local",next);return next;
     });
     if(visitor.country){setVisitorLocation(visitor);writeCache("visitor-location",visitor);}
     setLocationMessage("");
    })
    .catch(()=>{if(requestVersion===locationRequestVersion.current)setLocationMessage("Weather is shown for your GPS coordinates; nearby place name is temporarily unavailable.");})
    .finally(()=>window.clearTimeout(timeout));
  },error=>{
   if(requestVersion!==locationRequestVersion.current)return;
   if(local){setLocationStatus("ready");setLocationMessage("Could not refresh GPS; showing your last saved location and weather.");}
   else if(error.code===1){setLocationStatus("denied");setLocationMessage("Location permission is off. Allow precise location access, or search for a city.");}
   else if(error.code===3){setLocationStatus("error");setLocationMessage("Device location timed out. Check Location/GPS on your phone and retry.");}
   else{setLocationStatus("error");setLocationMessage("Your device location could not be detected. Check GPS permission and retry.");}
  },{enableHighAccuracy:true,timeout:12000,maximumAge:120000});
 };

 useEffect(()=>{if(locationStarted.current)return;locationStarted.current=true;detectLocalWeather()},[]);
 const refreshWeather=async(origin:Place)=>{
  const requestVersion=++cityRequestVersion.current;
  setBusy(true);
  try{
   const country=origin.country||origin.region.split(",").map(part=>part.trim()).filter(Boolean).pop()||"Unknown";
   const url=`${API}/api/weather/featured?latitude=${origin.lat}&longitude=${origin.lon}&country=${encodeURIComponent(country)}`;
   const response=await fetchBounded(url,{cache:"no-store"},14000);
   if(!response.ok)throw new Error(`Featured weather API returned HTTP ${response.status}`);
   const payload=await response.json();
   if(!Array.isArray(payload.reports)||payload.reports.length===0)throw new Error("No featured city reports returned");
   if(requestVersion!==cityRequestVersion.current)return;
   const rows:Place[]=payload.reports.map((item:any)=>({
    name:item.name,
    country:item.country,
    region:item.scope==="national"?`${item.country} · National`:item.scope==="regional"?`${item.country} · Regional reference`:`${item.country} · Nearby international`,
    lat:item.lat,lon:item.lon,current:item.current||{},loading:false,error:!hasValidCurrent(item.current)
   }));
   setCities(rows);writeCache("cities",rows);setPersonalizedCities(true);writeCache("cities-personalized",true);const timestamp=payload.retrieved_at||new Date().toISOString();setUpdated(timestamp);writeCache("cities-updated",timestamp);
  }catch{
   if(requestVersion===cityRequestVersion.current)setCities(previous=>previous.map(city=>({...city,loading:false,error:!hasValidCurrent(city.current)})));
  }finally{if(requestVersion===cityRequestVersion.current)setBusy(false);}
 };
 const refreshPopularCities=async()=>{
  const requestVersion=++cityRequestVersion.current;
  setBusy(true);
  try{
   const latitudes=CITIES.map(city=>city.lat).join(",");
   const longitudes=CITIES.map(city=>city.lon).join(",");
   const response=await fetchBounded(`${API}/api/weather/bulk?latitudes=${encodeURIComponent(latitudes)}&longitudes=${encodeURIComponent(longitudes)}`,{cache:"no-store"},14000);
   if(!response.ok)throw new Error("Bulk weather endpoint unavailable");
   const payload=await response.json();
   if(!Array.isArray(payload.reports)||payload.reports.length!==CITIES.length)throw new Error("Incomplete popular city response");
   if(requestVersion!==cityRequestVersion.current)return;
   const rows=CITIES.map((city,index)=>({...city,current:payload.reports[index]?.current||{},loading:false,error:!hasValidCurrent(payload.reports[index]?.current)}));setCities(rows);writeCache("cities",rows);
   setPersonalizedCities(false);writeCache("cities-personalized",false);const timestamp=payload.retrieved_at||new Date().toISOString();setUpdated(timestamp);writeCache("cities-updated",timestamp);
  }catch{
   // Keep cached reports; avoid a slow fan-out of 12 individual requests.
   if(requestVersion===cityRequestVersion.current)setCities(previous=>previous.map(city=>({...city,loading:false,error:!hasValidCurrent(city.current)})));
  }finally{if(requestVersion===cityRequestVersion.current)setBusy(false);}
 };
 useEffect(()=>{
  if(!visitorLocation)return;
  void refreshWeather(visitorLocation);
  const id=window.setInterval(()=>void refreshWeather(visitorLocation),5*60*1000);
  return()=>window.clearInterval(id);
 },[visitorLocation?.lat,visitorLocation?.lon,visitorLocation?.country,visitorLocation?.region]);
 const refreshFeeds=async()=>{
  try{
   const response=await fetchBounded(`${API}/api/cyclones`,{cache:"no-store"},10000);
   if(response.ok){const data=await response.json();setStorms(data.events||[]);writeCache("storms",data.events||[]);}
  }catch{/* Keep the last successful severe-weather event report. */}
 };
 useEffect(()=>{void refreshFeeds();const newsId=window.setInterval(()=>void refreshFeeds(),5*60*1000);return()=>window.clearInterval(newsId)},[]);
 useEffect(()=>{if(visitorLocation)return;void refreshPopularCities();const id=window.setInterval(()=>void refreshPopularCities(),5*60*1000);return()=>window.clearInterval(id)},[visitorLocation?.lat,visitorLocation?.lon,visitorLocation?.country]);

 useEffect(()=>{
  if(!local)return;
  const {lat,lon}=local;
  let active=true;
  const refreshLocal=async()=>{
   const controller=new AbortController();
   const timeout=window.setTimeout(()=>controller.abort(),75000);
   try{
    const response=await fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`,{cache:"no-store",signal:controller.signal});
    if(!response.ok)throw new Error(`Weather service returned HTTP ${response.status}`);
    const data=await response.json();
    if(!active)return;
    setLocal(previous=>{
     if(!previous||Math.abs(previous.lat-lat)>0.001||Math.abs(previous.lon-lon)>0.001)return previous;
     const valid=hasValidCurrent(data.current);
     const next={...previous,current:valid?data.current:previous.current,loading:false,error:!valid&&!previous.current};
     writeCache("local",next);return next;
    });
   }catch{
    if(!active)return;
    setLocal(previous=>{
     if(!previous||Math.abs(previous.lat-lat)>0.001||Math.abs(previous.lon-lon)>0.001)return previous;
     const next={...previous,loading:false,error:!previous.current};writeCache("local",next);return next;
    });
   }finally{window.clearTimeout(timeout);}
  };
  void refreshLocal();
  const id=window.setInterval(()=>void refreshLocal(),5*60*1000);
  return()=>{active=false;window.clearInterval(id);};
 },[local?.lat,local?.lon]);

 const hasValidCurrent=(value?:Current)=>typeof value?.temperature_2m==="number"&&Number.isFinite(value.temperature_2m);
 const showWeatherNotification=async(place:Place)=>{
  if(!place.current||!hasValidCurrent(place.current)||!("Notification" in window)||Notification.permission!=="granted")return;
  try{
   const registration=notificationRegistration.current||await navigator.serviceWorker.ready;
   const current=place.current;
   const temp=Math.round(current.temperature_2m as number);
   const condition=weatherLabel(current.weather_code);
   const code=current.weather_code??-1;
   const rain=(current.precipitation??0)>0||[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code);
   const storm=[95,96,99].includes(code);
   const message=storm?"Thunderstorms are nearby. Stay alert and avoid exposed areas.":rain?"Rain is reported in your area. Carry an umbrella.":temp>=38?"High heat today. Drink water and limit prolonged outdoor activity.":temp<=17?"Cool conditions outside. A light layer may help.":(current.cloud_cover??0)>=85?"Overcast skies right now. Keep an eye on changing conditions.":(current.cloud_cover??0)>=40?"Clouds and sunshine may alternate. Enjoy your day.":(current.wind_speed_10m??0)>=30?"Strong winds are reported. Secure loose outdoor items.":(current.relative_humidity_2m??0)>=85?"Humidity is high. Stay hydrated and take it easy.":"Weather looks settled for now. Have a good day.";
   await registration.showNotification("EARTH WEATHER",{
    body:`${icon(current.weather_code)}  ${temp}°C · ${condition} · ${place.name}\n${message}`,
    icon:"/web-logo.png",badge:"/favicon.svg",tag:"earth-weather-current",
    data:{url:"/"}
   });
  }catch{/* Notifications may be unavailable in private or restricted browser modes. */}
 };

 useEffect(()=>{
  const c=local?.current;
  if(!notificationsEnabled||!local||!c||!hasValidCurrent(c)||!("Notification" in window)||Notification.permission!=="granted")return;
  const next={temperature:c.temperature_2m,code:c.weather_code,precipitation:c.precipitation||0};
  let previous:any=null;
  try{const raw=localStorage.getItem("earth-weather-notification-snapshot");if(raw)previous=JSON.parse(raw);}catch{/* Ignore a damaged local snapshot. */}
  if(!previous){localStorage.setItem("earth-weather-notification-snapshot",JSON.stringify(next));void showWeatherNotification(local);return;}
  const meaningfulChange=Math.abs((next.temperature??0)-(previous.temperature??0))>=2||next.code!==previous.code||((next.precipitation??0)>0&&(previous.precipitation??0)<=0);
  localStorage.setItem("earth-weather-notification-snapshot",JSON.stringify(next));
  if(meaningfulChange)void showWeatherNotification(local);
 },[notificationsEnabled,local?.name,local?.current?.temperature_2m,local?.current?.weather_code,local?.current?.precipitation]);
 const active=cities.filter(c=>hasValidCurrent(c.current));
 const hottest=useMemo(()=>[...active].sort((a,b)=>(b.current?.temperature_2m??-100)-(a.current?.temperature_2m??-100))[0],[active]);
 const nationalCities=cities.filter(city=>city.region.endsWith("· National"));
 const regionalCities=cities.filter(city=>city.region.endsWith("· Regional reference"));
 const internationalCities=cities.filter(city=>city.region.endsWith("· Nearby international"));
 const renderCityCards=(items:Place[])=>items.map(c=><article className={`city-card weather-scene ${weatherScene(c.current?.weather_code,c.current?.cloud_cover)} ${solarPhase(c.lat,c.lon,c.current?.time,c.current?.is_day)} ${cloudDensity(c.current?.cloud_cover)}`} key={c.name}><span className="weather-sky-art" aria-hidden="true"><i/><i/><i/></span><div className="city-top"><div><small>{c.region}</small><h3>{c.name}</h3></div><span className="weather-icon">{icon(c.current?.weather_code)}</span></div>{c.loading?<div className="city-loading">Loading report…</div>:c.error?<div className="city-loading">Report temporarily unavailable</div>:<><div className="city-temp">{Math.round(c.current?.temperature_2m??0)}<sup>°C</sup></div><div className="city-condition">{weatherLabel(c.current?.weather_code)}</div><div className="city-stats"><span>Humidity <b>{c.current?.relative_humidity_2m??"—"}%</b></span><span>Wind <b>{formatMetric(c.current?.wind_speed_10m)} km/h</b></span><span>Cloud <b>{c.current?.cloud_cover??"—"}%</b></span></div><div className="city-observed">{modelTime(c.current?.time)}</div></>}</article>);
 const currentLocation=local||visitorLocation;
 const currentCountryCode=(currentLocation?.country_code||"IN").toUpperCase();
 const topCities=TOP_CITIES_BY_COUNTRY[currentCountryCode]||WORLD_TOP_CITIES.slice(0,5);
 const search=async()=>{
  const term=query.trim();
  if(term.length<2){setLocationSearchResults([]);setLocationSearchError("Enter at least two characters to search.");return;}
  const requestVersion=++locationSearchVersion.current;
  setLocationSearching(true);setLocationSearchError("");
  try{
   const response=await fetchBounded(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(term)}`,{headers:{"Accept-Language":"en"}},12000);
   if(!response.ok)throw new Error(`Location search returned HTTP ${response.status}`);
   const data=await response.json();
   if(requestVersion!==locationSearchVersion.current)return;
   const results:Place[]=(Array.isArray(data)?data:[]).map((item:any)=>{
    const address=item.address||{};
    const country=address.country||"";
    const state=address.state||address.region||address.province||"";
    const district=address.state_district||address.county||address.municipality||"";
    const name=item.name||address.city||address.town||address.village||address.suburb||district||term;
    return {name,region:[state,country].filter(Boolean).join(", ")||item.display_name||country,lat:Number(item.lat),lon:Number(item.lon),country,country_code:address.country_code?.toUpperCase(),state,district,source:"search" as const};
   }).filter((place:Place)=>Number.isFinite(place.lat)&&Number.isFinite(place.lon));
   setLocationSearchResults(results);
   if(results.length===0)setLocationSearchError("No matching locations found. Try another city or region.");
  }catch(error){
   if(requestVersion===locationSearchVersion.current)setLocationSearchError(error instanceof Error?error.message:"Location search is temporarily unavailable.");
  }finally{
   if(requestVersion===locationSearchVersion.current)setLocationSearching(false);
  }
 };
 useEffect(()=>{
  if(!locationPickerOpen)return;
  const term=query.trim();
  if(term.length<2){setLocationSearchResults([]);setLocationSearching(false);setLocationSearchError("");return;}
  setLocationSearchResults([]);setLocationSearching(true);setLocationSearchError("");
  const timer=window.setTimeout(()=>{void search();},750);
  return()=>{window.clearTimeout(timer);locationSearchVersion.current++;};
 },[locationPickerOpen,query]);
 const chooseLocation=async(place:Place)=>{
  const requestVersion=++locationRequestVersion.current;
  setLocationSelectionPending(place.name);setLocationSearchError("");
  try{
   const response=await fetchBounded(`${API}/api/weather?latitude=${place.lat}&longitude=${place.lon}`,{cache:"no-store"},16000);
   if(!response.ok)throw new Error(`Weather feed returned HTTP ${response.status}`);
   const data=await response.json();
   if(requestVersion!==locationRequestVersion.current)return;
   const selected:Place={...place,source:"search",current:data.current||{},loading:false,error:!hasValidCurrent(data.current)};
   setLocal(selected);writeCache("local",selected);
   const selectedLocation:Place={...place,source:"search"};
   setVisitorLocation(selectedLocation);writeCache("visitor-location",selectedLocation);
   setIsSearchLocation(true);setLocationStatus("ready");
   setLocationMessage(hasValidCurrent(data.current)?"":"Weather data is temporarily unavailable for this location.");
   setNotice("");setQuery("");setLocationSearchResults([]);setLocationPickerOpen(false);
  }catch(error){
   if(requestVersion===locationRequestVersion.current)setLocationSearchError(error instanceof Error?error.message:"Weather could not be loaded for this location.");
  }finally{
   if(requestVersion===locationRequestVersion.current)setLocationSelectionPending("");
  }
 };
 useEffect(()=>{
  if(!locationPickerOpen)return;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  const handleKeyDown=(event:KeyboardEvent)=>{if(event.key==="Escape"){setLocationPickerOpen(false);setQuery("");setLocationSearchResults([]);}};
  window.addEventListener("keydown",handleKeyDown);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener("keydown",handleKeyDown);};
 },[locationPickerOpen]);
 const signIn=async()=>{if(!auth)return;try{await signInWithPopup(auth,googleProvider)}catch{setNotice("Google sign-in could not be completed.")}};
 const countryTab=visitorLocation?.country||"Country";
 const stateTab=visitorLocation?.state||"State";
 const localTab=visitorLocation?.name?(visitorLocation?.district?`${visitorLocation.name} · ${visitorLocation.district}`:visitorLocation.name):(visitorLocation?.district||"Local");
 const newsTabs=[{key:"World",label:"World"},{key:"Country",label:countryTab},{key:"State",label:stateTab},{key:"Local",label:localTab}];
 return <div className="news-site">
  {locationPickerOpen&&<div className="location-picker-overlay" role="dialog" aria-modal="true" aria-label="Search weather locations">
   <div className="location-picker-shell">
    <form className="location-picker-search" onSubmit={event=>{event.preventDefault();void search();}}>
     <div className="location-picker-input-wrap">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.1 4.1"/></svg>
      <input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search" aria-label="Search city or region" autoComplete="off"/>
     </div>
     <button type="button" className="location-picker-cancel" onClick={()=>{setLocationPickerOpen(false);setQuery("");setLocationSearchResults([]);setLocationSearchError("");}}>Cancel</button>
    </form>
    {query.trim().length>=2?<section className="location-picker-results">
     <p className="location-picker-heading">Search results</p>
     {locationSearching&&<p className="location-picker-message">Searching locations…</p>}
     {locationSelectionPending&&<p className="location-picker-message">Loading weather for {locationSelectionPending}…</p>}
     {!locationSearching&&locationSearchResults.map(place=><button className="location-picker-result" type="button" key={`${place.name}-${place.lat}-${place.lon}`} onClick={()=>void chooseLocation(place)} disabled={Boolean(locationSelectionPending)}><span className="location-result-pin">⌖</span><span><strong>{place.name}</strong><small>{place.region}</small></span><span className="location-result-arrow">›</span></button>)}
     {!locationSearching&&locationSearchError&&<p className="location-picker-message error">{locationSearchError}</p>}
    </section>:<>
     <section className="location-picker-section">
      <p className="location-picker-heading">Current city</p>
      {currentLocation?<button className="location-city-pill current" type="button" onClick={()=>{setLocationPickerOpen(false);setQuery("");setLocationSearchResults([]);}} disabled={Boolean(locationSelectionPending)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg><span>{currentLocation.name}</span></button>:<button className="location-city-pill current" type="button" onClick={()=>{setLocationPickerOpen(false);detectLocalWeather();}}>◎ <span>Detect current location</span></button>}
     </section>
     <section className="location-picker-section">
      <p className="location-picker-heading">Top cities · {currentLocation?.country||"Your region"}</p>
      <div className="location-city-grid">{topCities.map(place=><button className="location-city-pill" type="button" key={`${place.name}-${place.country_code}`} onClick={()=>void chooseLocation(place)} disabled={Boolean(locationSelectionPending)}>{place.name}</button>)}</div>
     </section>
     <section className="location-picker-section world">
      <p className="location-picker-heading">Top cities - World</p>
      <div className="location-city-grid">{WORLD_TOP_CITIES.map(place=><button className="location-city-pill" type="button" key={`${place.name}-${place.country_code}`} onClick={()=>void chooseLocation(place)} disabled={Boolean(locationSelectionPending)}>{place.name}</button>)}</div>
     </section>
     {locationSelectionPending&&<p className="location-picker-message">Loading weather for {locationSelectionPending}…</p>}
     {locationSearchError&&<p className="location-picker-message error">{locationSearchError}</p>}
    </>}
   </div>
  </div>}
  {page==="home"?<WeatherChannelLayout
    active={section}
    location={local}
    onNavigate={setSection}
    onSearchLocation={()=>{setQuery("");setLocationSearchResults([]);setLocationSearchError("");setLocationPickerOpen(true);}}
    onAccount={()=>{if(user)void signOut(auth!);else void signIn();}}
    accountName={user?.displayName||null}
   >
    {(["Weather Report","Hourly","10 Day","Radar","Air Quality","Allergy","Storm reports"] as string[]).includes(section)
      ?<WeatherChannelPage mode={section as WeatherChannelMode} location={local} cities={cities} storms={storms} onNavigate={setSection}/>
      :section==="Satellite Report"?<SatelliteNumericalReport/>
      :section==="Satellite imagery"?<SatelliteDashboard/>
      :<WeatherNewsPage section={section as "World"|"Country"|"State"|"Local"} location={visitorLocation}/>} 
   </WeatherChannelLayout>:<>
    <header className="masthead"><div className="masthead-row"><div className="brand-lockup"><img className="brand-wordmark" src="/logo.png" alt="EARTH WEATHER" width="1200" height="220"/></div><div className="masthead-actions"><button className="header-location-search" type="button" aria-label="Search city or region" title="Search city or region" onClick={()=>{setQuery("");setLocationSearchResults([]);setLocationSearchError("");setLocationPickerOpen(true);}}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.1 4.1"/></svg></button>{user?<button className="masthead-account-button" onClick={()=>void signOut(auth!)}>{user.displayName||"Account"}</button>:<button className="masthead-account-button" onClick={()=>void signIn()}>Sign in</button>}</div></div></header>
    <main className="news-main info-page"><SitePageView slug={page}/></main>
   </>}
  <footer className="news-footer">
   <div className="footer-heading">
    <img className="footer-logo" src="/logo.png" alt="EARTH WEATHER logo" />
    <div className="footer-brand">EARTH WEATHER</div>
   </div>
   <nav className="footer-navigation" aria-label="Footer navigation">
    {FOOTER_GROUPS.map(group=><section className="footer-group" key={group.title}>
     <h3>{group.title}</h3>
     {group.links.map(link=><a href={SITE_PATHS[link.page]} key={link.page}>{link.label}</a>)}
    </section>)}
   </nav>
   <div className="footer-copyright">© {new Date().getFullYear()} Earth Weather Channel. All rights reserved. <strong>BMR INC.</strong></div>
  </footer>
 </div>;
}
