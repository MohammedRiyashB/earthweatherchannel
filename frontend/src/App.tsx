import { useEffect, useMemo, useRef, useState } from "react";
import { auth, firebaseReady, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { FOOTER_GROUPS, resolveSitePage, SITE_PATHS, SitePageView, type SitePageId } from "./sitePages";

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
type SatelliteLayer={id:string;title:string;formats?:string[];tile_templates?:string[]};
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
 const day=new Date().toISOString().slice(0,10);
 const imageUrl=`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${encodeURIComponent(layer)}&STYLES=&SRS=EPSG:4326&BBOX=${area.bbox}&WIDTH=1200&HEIGHT=720&FORMAT=image/jpeg&TIME=${day}`;
 useEffect(()=>{let active=true;fetch(`${API}/api/satellites/catalog`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(d=>{if(active)setCatalog(d)}).catch(e=>{if(active)setCatalogError(e instanceof Error?e.message:"Satellite catalogue unavailable")});return()=>{active=false}},[refresh]);
 useEffect(()=>{setImageError(false);setImageLoaded(false)},[layer,region,refresh]);
 const mission=layer.startsWith("MODIS_Terra")?"NASA Terra MODIS":layer.startsWith("MODIS_Aqua")?"NASA Aqua MODIS":"NASA / NOAA Suomi-NPP VIIRS";
 return <main className="news-main satellite-page">
  <div className="news-toolbar"><div><span className="eyebrow">DIRECT SATELLITE IMAGERY · NASA EOSDIS</span><h1>Satellite Earth Monitor</h1><p>Live public satellite imagery retrieved directly from NASA Global Imagery Browse Services (GIBS).</p></div><button className="refresh-button" onClick={()=>setRefresh(x=>x+1)}>↻ Refresh satellite data</button></div>
  <div className="satellite-status"><span className="satellite-live-dot"/> NASA GIBS WMS <strong>{catalog?.live_imagery?.status==="live"||imageLoaded?"CONNECTED":"CHECKING CONNECTION"}</strong><span>{catalog?.live_imagery?.retrieved_layers??"—"} live catalogue layers discovered</span></div>
  <section className="satellite-viewer">
   <div className="satellite-controls">
    <label>Satellite sensor<select value={layer} onChange={e=>setLayer(e.target.value)}><option value="VIIRS_SNPP_CorrectedReflectance_TrueColor">Suomi-NPP VIIRS · True colour</option><option value="MODIS_Terra_CorrectedReflectance_TrueColor">Terra MODIS · True colour</option><option value="MODIS_Aqua_CorrectedReflectance_TrueColor">Aqua MODIS · True colour</option></select></label>
    <label>Viewing region<select value={region} onChange={e=>setRegion(e.target.value)}><option value="india">India & Indian Ocean</option><option value="asia">Asia-Pacific</option><option value="world">Global view</option></select></label>
   </div>
   <div className="satellite-image-frame">{imageError?<div className="satellite-image-error">Satellite image is temporarily unavailable for this layer or date. Try refreshing or selecting another sensor.</div>:<img key={imageUrl} src={imageUrl} alt={`${mission} satellite imagery over ${area.label}`} onLoad={()=>setImageLoaded(true)} onError={()=>setImageError(true)}/>}<div className="satellite-image-caption"><span>{mission}</span><span>{area.label}</span><span>Requested observation date: {day} UTC</span></div></div>
   <div className="satellite-image-meta"><span>Source: NASA EOSDIS GIBS · Public WMS imagery</span><a href="https://nasa-gibs.github.io/gibs-api-docs/" target="_blank" rel="noreferrer">GIBS documentation ↗</a></div>
  </section>
  <section className="satellite-info-grid"><article><span className="eyebrow">CONNECTED DATA FEED</span><h2>NASA GIBS</h2><p>Actual map imagery is requested from NASA's public WMS service. The selected layer is served by the named satellite instrument; this is not a simulated image.</p><a href="https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0" target="_blank" rel="noreferrer">Live WMS capabilities ↗</a></article><article><span className="eyebrow">OBSERVATION LIMITATIONS</span><h2>Not a thermometer</h2><p>True-colour imagery shows clouds, land and ocean appearance. It does not directly provide local air temperature, relative humidity or surface wind. Those require separate calibrated satellite retrieval products or observation datasets.</p></article></section>
  {catalogError&&<p className="feed-note">Satellite catalogue status could not be checked: {catalogError}. The public NASA image endpoint is loaded independently.</p>}
  <p className="feed-note">Imagery availability depends on satellite overpass, processing latency, cloud conditions, product coverage and NASA service availability. NASA GIBS is the only live satellite imagery integration currently confirmed in this dashboard; other satellite programmes are not marked connected until their data endpoints are actually integrated and tested.</p>
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

export default function App(){
 const [cities,setCities]=useState<Place[]>(()=>readCache<Place[]>("cities",CITIES.map(x=>({...x,loading:true}))));
 const [storms,setStorms]=useState<Storm[]>(()=>readCache<Storm[]>("storms",[]));
  const [updated,setUpdated]=useState<string>(()=>readCache<string>("cities-updated",""));const [busy,setBusy]=useState(false);const [query,setQuery]=useState("");
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
 const search=async()=>{if(!query.trim())return;const requestVersion=++locationRequestVersion.current;try{const r=await fetchBounded(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`,{headers:{"Accept-Language":"en"}},10000);const d=await r.json();if(requestVersion!==locationRequestVersion.current)return;if(!d.length)throw new Error("No matching place found");const address=d[0].address||{};const country=address.country||d[0].display_name.split(",").map((part:string)=>part.trim()).filter(Boolean).pop();const state=address.state||address.region;const district=address.state_district||address.county||address.municipality;const p:Place={name:d[0].name||query,region:[state,country].filter(Boolean).join(", ")||d[0].display_name,source:"search",country,country_code:address.country_code?.toUpperCase(),state,district,lat:Number(d[0].lat),lon:Number(d[0].lon)};const w=await fetchBounded(`${API}/api/weather?latitude=${p.lat}&longitude=${p.lon}`,{},14000);if(requestVersion!==locationRequestVersion.current)return;if(!w.ok)throw new Error("Weather feed unavailable");const wd=await w.json();if(requestVersion!==locationRequestVersion.current)return;const selected={...p,current:wd.current||{}};setLocal(selected);writeCache("local",selected);setVisitorLocation(p);writeCache("visitor-location",p);setIsSearchLocation(true);setLocationStatus("ready");setLocationMessage("");setNotice("");}catch(e){if(requestVersion!==locationRequestVersion.current)return;setNotice(e instanceof Error?e.message:"Search failed.");}};
 const signIn=async()=>{if(!auth)return;try{await signInWithPopup(auth,googleProvider)}catch{setNotice("Google sign-in could not be completed.")}};
 const countryTab=visitorLocation?.country||"Country";
 const stateTab=visitorLocation?.state||"State";
 const localTab=visitorLocation?.name?(visitorLocation?.district?`${visitorLocation.name} · ${visitorLocation.district}`:visitorLocation.name):(visitorLocation?.district||"Local");
 const newsTabs=[{key:"World",label:"World"},{key:"Country",label:countryTab},{key:"State",label:stateTab},{key:"Local",label:localTab}];
 return <div className="news-site">
  <header className="masthead"><div className="masthead-row"><div className="brand-lockup"><img className="brand-wordmark" src="/logo.png" alt="EARTH WEATHER" width="1200" height="220" /></div><div className="masthead-actions">{user?<button onClick={()=>void signOut(auth!)}>{user.displayName||"Account"}</button>:<button onClick={()=>void signIn()}>Sign in</button>}</div></div></header>
  <nav className="news-nav">{[{key:"Weather Report",label:"Weather Report"},...newsTabs,{key:"Satellite imagery",label:"Satellite imagery"},{key:"Satellite Report",label:"Satellite Report"}].map(item=><button className={section===item.key?"active":""} key={item.key} onClick={()=>setSection(item.key)}>{item.label}</button>)}</nav>
  {page==="home"?(section==="Satellite Report"?<SatelliteNumericalReport/>:section==="Satellite imagery"?<SatelliteDashboard/>:section!=="Weather Report"?<WeatherNewsPage section={section as "World"|"Country"|"State"|"Local"} location={visitorLocation}/>:<main className="news-main">
   {notice&&<div className="notice">{notice}</div>}
   <form className="search-weather weather-search-top" onSubmit={e=>{e.preventDefault();void search()}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search city or region" aria-label="Search city or region"/><button type="submit">Search</button></form>

   <section className="local-weather-card" aria-live="polite">
    <div className="local-weather-heading">
     <div><span className="eyebrow">{isSearchLocation ? "SELECTED CITY" : "WEATHER NEAR YOU"}</span><h2>{isSearchLocation && local ? `Weather in ${local.name}` : "Your current location"}</h2><p>{isSearchLocation ? "Showing weather for the city you searched" : "Automatically detected using your device location"}</p></div>
    </div>
    {local&&locationStatus==="ready"?<>
     <div className={`local-weather-place weather-scene ${weatherScene(local.current?.weather_code,local.current?.cloud_cover)} ${solarPhase(local.lat,local.lon,local.current?.time,local.current?.is_day)} ${cloudDensity(local.current?.cloud_cover)}`}><span className="weather-sky-art" aria-hidden="true"><i/><i/><i/></span>
      <div><h3>{local.name}</h3><p>{local.region}</p></div>
      <div className="local-temperature"><span>{icon(local.current?.weather_code)}</span><strong>{local.current?.temperature_2m!=null?Math.round(local.current.temperature_2m)+"°C":"—"}</strong><small>{weatherLabel(local.current?.weather_code)}</small></div>
     </div>
     {local.loading&&!local.current&&<p className="local-weather-foot">Getting current weather for this location…</p>}{local.error&&!local.current&&<p className="local-weather-foot">Weather data is temporarily unavailable. Your detected location is still shown.</p>}{locationMessage&&<p className="local-weather-foot">{locationMessage}</p>}<div className="local-weather-stats">
      <div><span>Humidity</span><strong>{local.current?.relative_humidity_2m!=null?local.current.relative_humidity_2m+"%":"—"}</strong></div>
      <div><span>Wind</span><strong>{local.current?.wind_speed_10m!=null?formatMetric(local.current.wind_speed_10m)+" km/h":"—"}</strong></div>
      <div><span>Cloud cover</span><strong>{local.current?.cloud_cover!=null?local.current.cloud_cover+"%":"—"}</strong></div>
     </div>
     <div className="local-weather-foot">{modelTime(local.current?.time)}
    </div>
    </>:<div className="local-weather-prompt"><span>{locationMessage}</span><button onClick={detectLocalWeather} disabled={locationStatus==="locating"}>{locationStatus==="denied"?"Try location again":"Retry location"}</button></div>}
   </section>

   <section className="lead-grid">
    <aside className="top-brief"><div className="section-heading"><h2>Weather briefing</h2><span>GLOBAL</span></div>{hottest&&<div className="brief-highlight"><small>WARMEST CITY IN THIS LIST · NOT YOUR LOCATION</small><b>{hottest.name}</b><strong>{Math.round(hottest.current?.temperature_2m??0)}°C</strong><span>{weatherLabel(hottest.current?.weather_code)}</span></div>}<div className="brief-line"><span>Active severe-storm events</span><b>{storms.length}</b></div><div className="brief-line"><span>Reporting locations</span><b>{active.length}/{cities.length}</b></div><div className="brief-line"><span>Auto refresh</span><b>Local 60s · Cities 5m</b></div><button className="refresh-button" onClick={()=>{if(visitorLocation)void refreshWeather(visitorLocation);else void refreshPopularCities();void refreshFeeds()}} disabled={busy}>{busy?"Refreshing…":"↻ Refresh live reports"}</button></aside>
   </section>

   <section className="section-block">
    <div className="section-heading">
     <div>
      <span className="eyebrow">{personalizedCities?"NATIONAL & INTERNATIONAL CITY REPORTS":"GLOBAL CITY WATCHLIST"}</span>
      <h2>{personalizedCities?"Weather for your country and nearby regions":"Live weather across the world"}</h2>
     </div>
     <span className="updated-label">LAST CHECKED · {updated?stamp(updated):"LOADING"}</span>
    </div>
    {personalizedCities?<div className="city-report-groups">
     {nationalCities.length>0&&<div className="city-report-group"><div className="city-group-heading">National · {visitorLocation?.country||"Your country"}</div><div className="city-grid">{renderCityCards(nationalCities)}</div></div>}
     {regionalCities.length>0&&<div className="city-report-group"><div className="city-group-heading">Nearby regional cities</div><div className="city-grid">{renderCityCards(regionalCities)}</div></div>}
     {internationalCities.length>0&&<div className="city-report-group"><div className="city-group-heading">Nearby international cities</div><div className="city-grid">{renderCityCards(internationalCities)}</div></div>}
    </div>:<div className="city-grid">{renderCityCards(cities)}</div>}
   </section>

   <section className="section-block"><div><div className="section-heading"><div><span className="eyebrow">SEVERE WEATHER WATCH</span><h2>Storm & event reports</h2></div><span className="source-tag">NASA EONET</span></div>{storms.length?storms.slice(0,8).map(s=><article className="event-row" key={s.id}><div className="event-mark">!</div><div><h3>{s.title}</h3><p>{s.description||"A severe-weather event is listed in the NASA EONET event catalogue."}</p><small>EVENT CATALOGUE · {s.coordinates?.length||0} mapped positions</small></div>{s.link&&<a href={s.link} target="_blank" rel="noreferrer">Source ↗</a>}</article>):<div className="empty-report">No active severe-storm event entries were returned by the current event feed. This does not mean there is no severe weather.</div>}</div>
    
   </section>
  </main>)
  :<main className="news-main info-page"><SitePageView slug={page}/></main>}
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
