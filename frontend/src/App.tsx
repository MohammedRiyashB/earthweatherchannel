import { useEffect, useMemo, useRef, useState } from "react";
import { auth, firebaseReady, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";

const API=import.meta.env.VITE_API_BASE_URL||"https://earthweather-api.onrender.com";
type Current={time?:string;temperature_2m?:number;relative_humidity_2m?:number;apparent_temperature?:number;precipitation?:number;cloud_cover?:number;pressure_msl?:number;wind_speed_10m?:number;wind_direction_10m?:number;weather_code?:number};
type Place={name:string;region:string;lat:number;lon:number;country_code?:string;current?:Current;loading?:boolean;error?:boolean};
type Storm={id:string;title:string;description?:string;link?:string;coordinates?:{lat:number;lon:number;date?:string}[]};
type Story={title:string;url:string;source:string;published_at?:string;language?:string;image?:string};
const CITIES:Place[]=[
{name:"New Delhi",region:"India",lat:28.6139,lon:77.209},{name:"Chennai",region:"India",lat:13.0827,lon:80.2707},
{name:"Mumbai",region:"India",lat:19.076,lon:72.8777},{name:"London",region:"United Kingdom",lat:51.5072,lon:-0.1276},
{name:"New York",region:"United States",lat:40.7128,lon:-74.006},{name:"Tokyo",region:"Japan",lat:35.6762,lon:139.6503},
{name:"Dubai",region:"UAE",lat:25.2048,lon:55.2708},{name:"Sydney",region:"Australia",lat:-33.8688,lon:151.2093},
{name:"Singapore",region:"Singapore",lat:1.3521,lon:103.8198},{name:"Cape Town",region:"South Africa",lat:-33.9249,lon:18.4241},
{name:"São Paulo",region:"Brazil",lat:-23.5505,lon:-46.6333},{name:"Erode",region:"Tamil Nadu, India",lat:11.341,lon:77.7172}
];
const GLOBAL_MAJOR_CITIES:Place[]=[
{name:"New Delhi",region:"India",country_code:"IN",lat:28.6139,lon:77.209},{name:"Mumbai",region:"India",country_code:"IN",lat:19.076,lon:72.8777},{name:"Kolkata",region:"India",country_code:"IN",lat:22.5726,lon:88.3639},{name:"Chennai",region:"India",country_code:"IN",lat:13.0827,lon:80.2707},
{name:"New York",region:"United States",country_code:"US",lat:40.7128,lon:-74.006},{name:"Los Angeles",region:"United States",country_code:"US",lat:34.0522,lon:-118.2437},{name:"Chicago",region:"United States",country_code:"US",lat:41.8781,lon:-87.6298},{name:"Houston",region:"United States",country_code:"US",lat:29.7604,lon:-95.3698},{name:"Miami",region:"United States",country_code:"US",lat:25.7617,lon:-80.1918},{name:"San Francisco",region:"United States",country_code:"US",lat:37.7749,lon:-122.4194},
{name:"London",region:"United Kingdom",country_code:"GB",lat:51.5072,lon:-0.1276},{name:"Manchester",region:"United Kingdom",country_code:"GB",lat:53.4808,lon:-2.2426},{name:"Birmingham",region:"United Kingdom",country_code:"GB",lat:52.4862,lon:-1.8904},{name:"Edinburgh",region:"United Kingdom",country_code:"GB",lat:55.9533,lon:-3.1883},
{name:"Dubai",region:"United Arab Emirates",country_code:"AE",lat:25.2048,lon:55.2708},{name:"Abu Dhabi",region:"United Arab Emirates",country_code:"AE",lat:24.4539,lon:54.3773},{name:"Sharjah",region:"United Arab Emirates",country_code:"AE",lat:25.3463,lon:55.4209},
{name:"Singapore",region:"Singapore",country_code:"SG",lat:1.3521,lon:103.8198},
{name:"Tokyo",region:"Japan",country_code:"JP",lat:35.6762,lon:139.6503},{name:"Osaka",region:"Japan",country_code:"JP",lat:34.6937,lon:135.5023},{name:"Fukuoka",region:"Japan",country_code:"JP",lat:33.5902,lon:130.4017},
{name:"Beijing",region:"China",country_code:"CN",lat:39.9042,lon:116.4074},{name:"Shanghai",region:"China",country_code:"CN",lat:31.2304,lon:121.4737},{name:"Guangzhou",region:"China",country_code:"CN",lat:23.1291,lon:113.2644},{name:"Shenzhen",region:"China",country_code:"CN",lat:22.5431,lon:114.0579},
{name:"Colombo",region:"Sri Lanka",country_code:"LK",lat:6.9271,lon:79.8612},{name:"Malé",region:"Maldives",country_code:"MV",lat:4.1755,lon:73.5093},{name:"Dhaka",region:"Bangladesh",country_code:"BD",lat:23.8103,lon:90.4125},{name:"Kathmandu",region:"Nepal",country_code:"NP",lat:27.7172,lon:85.324},{name:"Karachi",region:"Pakistan",country_code:"PK",lat:24.8607,lon:67.0011},{name:"Lahore",region:"Pakistan",country_code:"PK",lat:31.5204,lon:74.3587},
{name:"Bangkok",region:"Thailand",country_code:"TH",lat:13.7563,lon:100.5018},{name:"Kuala Lumpur",region:"Malaysia",country_code:"MY",lat:3.139,lon:101.6869},{name:"Jakarta",region:"Indonesia",country_code:"ID",lat:-6.2088,lon:106.8456},{name:"Manila",region:"Philippines",country_code:"PH",lat:14.5995,lon:120.9842},{name:"Hanoi",region:"Vietnam",country_code:"VN",lat:21.0278,lon:105.8342},
{name:"Sydney",region:"Australia",country_code:"AU",lat:-33.8688,lon:151.2093},{name:"Melbourne",region:"Australia",country_code:"AU",lat:-37.8136,lon:144.9631},{name:"Brisbane",region:"Australia",country_code:"AU",lat:-27.4698,lon:153.0251},{name:"Perth",region:"Australia",country_code:"AU",lat:-31.9505,lon:115.8605},
{name:"Toronto",region:"Canada",country_code:"CA",lat:43.6532,lon:-79.3832},{name:"Vancouver",region:"Canada",country_code:"CA",lat:49.2827,lon:-123.1207},{name:"Montreal",region:"Canada",country_code:"CA",lat:45.5019,lon:-73.5674},
{name:"Paris",region:"France",country_code:"FR",lat:48.8566,lon:2.3522},{name:"Berlin",region:"Germany",country_code:"DE",lat:52.52,lon:13.405},{name:"Madrid",region:"Spain",country_code:"ES",lat:40.4168,lon:-3.7038},{name:"Rome",region:"Italy",country_code:"IT",lat:41.9028,lon:12.4964},{name:"Amsterdam",region:"Netherlands",country_code:"NL",lat:52.3676,lon:4.9041},
{name:"Cairo",region:"Egypt",country_code:"EG",lat:30.0444,lon:31.2357},{name:"Nairobi",region:"Kenya",country_code:"KE",lat:-1.2921,lon:36.8219},{name:"Cape Town",region:"South Africa",country_code:"ZA",lat:-33.9249,lon:18.4241},{name:"Lagos",region:"Nigeria",country_code:"NG",lat:6.5244,lon:3.3792},
{name:"São Paulo",region:"Brazil",country_code:"BR",lat:-23.5505,lon:-46.6333},{name:"Mexico City",region:"Mexico",country_code:"MX",lat:19.4326,lon:-99.1332},{name:"Buenos Aires",region:"Argentina",country_code:"AR",lat:-34.6037,lon:-58.3816},{name:"Santiago",region:"Chile",country_code:"CL",lat:-33.4489,lon:-70.6693},
{name:"Riyadh",region:"Saudi Arabia",country_code:"SA",lat:24.7136,lon:46.6753},{name:"Doha",region:"Qatar",country_code:"QA",lat:25.2854,lon:51.531},{name:"Istanbul",region:"Türkiye",country_code:"TR",lat:41.0082,lon:28.9784},{name:"Moscow",region:"Russia",country_code:"RU",lat:55.7558,lon:37.6173},{name:"Auckland",region:"New Zealand",country_code:"NZ",lat:-36.8509,lon:174.7645}
];
const distanceKm=(lat1:number,lon1:number,lat2:number,lon2:number)=>{
 const rad=(value:number)=>value*Math.PI/180;
 const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);
 const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
};
const selectCityGroups=(countryCode:string,lat:number,lon:number)=>{
 const national=GLOBAL_MAJOR_CITIES.filter(city=>city.country_code===countryCode)
  .sort((a,b)=>distanceKm(lat,lon,a.lat,a.lon)-distanceKm(lat,lon,b.lat,b.lon)).slice(0,4);
 const international=GLOBAL_MAJOR_CITIES.filter(city=>city.country_code!==countryCode)
  .sort((a,b)=>distanceKm(lat,lon,a.lat,a.lon)-distanceKm(lat,lon,b.lat,b.lon)).slice(0,4);
 return {national,international};
};
const weatherLabel=(c?:number)=>c==null?"Weather update":c===0?"Clear skies":[1,2,3].includes(c)?"Partly cloudy":[45,48].includes(c)?"Foggy":[51,53,55,56,57].includes(c)?"Drizzle":[61,63,65,66,67,80,81,82].includes(c)?"Rain":[71,73,75,77,85,86].includes(c)?"Snow":[95,96,99].includes(c)?"Thunderstorms":"Variable conditions";
const weatherScene=(c?:number,cloud?:number)=>{
 if(c!=null&&[95,96,99].includes(c))return "scene-thunder";
 if(c!=null&&[71,73,75,77,85,86].includes(c))return "scene-snow";
 if(c!=null&&[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c))return "scene-rain";
 if(c!=null&&[45,48].includes(c))return "scene-fog";
 if((cloud??0)>=85||c===3)return "scene-overcast";
 if((cloud??0)>=25||c===1||c===2)return "scene-partly";
 return "scene-clear";
};
const icon=(c?:number)=>c===0?"☀":c!=null&&[1,2,3].includes(c)?"⛅":c!=null&&[45,48].includes(c)?"🌫":c!=null&&[95,96,99].includes(c)?"⛈":c!=null&&[71,73,75,77,85,86].includes(c)?"❄":"🌧";
const stamp=(s?:string)=>{if(!s)return "—";const d=new Date(s);return Number.isNaN(d.getTime())?"Recently indexed":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});};
const modelTime=(s?:string)=>{if(!s)return "—";const d=new Date(s.endsWith("Z")?s:s+"Z");return Number.isNaN(d.getTime())?"—":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"})+" UTC";};
const published=(value?:string)=>{
 if(!value)return "Recently indexed";
 let date=new Date(value);
 if(Number.isNaN(date.getTime()) && /^\\d{8}T\\d{6}Z?$/.test(value)){
  const raw=value.replace(/Z$/,"");
  const year=Number(raw.slice(0,4)),month=Number(raw.slice(4,6))-1,day=Number(raw.slice(6,8));
  const hour=Number(raw.slice(9,11)),minute=Number(raw.slice(11,13)),second=Number(raw.slice(13,15));
  date=new Date(Date.UTC(year,month,day,hour,minute,second));
 }
 return Number.isNaN(date.getTime())?"Recently indexed":date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
};
export default function App(){
 const [cities,setCities]=useState<Place[]>(CITIES.map(x=>({...x,loading:true})));
 const [storms,setStorms]=useState<Storm[]>([]);
 const [indiaNews,setIndiaNews]=useState<Story[]>([]);const [worldNews,setWorldNews]=useState<Story[]>([]);
 const [newsRegion,setNewsRegion]=useState<"india"|"world">("india");
 const [updated,setUpdated]=useState("");const [clock,setClock]=useState(new Date());const [busy,setBusy]=useState(false);const [query,setQuery]=useState("");
const [section,setSection]=useState("Weather Report");const [isSearchLocation,setIsSearchLocation]=useState(false);
 const [user,setUser]=useState<User|null>(null);const [notice,setNotice]=useState("");
 const [local,setLocal]=useState<Place|null>(null);
 const [locationStatus,setLocationStatus]=useState<"locating"|"ready"|"denied"|"error">("locating");
 const [locationMessage,setLocationMessage]=useState("Finding your nearby town or village…");
 const locationStarted=useRef(false);
 const locationRequestVersion=useRef(0);
 useEffect(()=>{if(!auth||!firebaseReady)return;return onAuthStateChanged(auth,setUser)},[]);

 const detectLocalWeather=()=>{
  const requestVersion=++locationRequestVersion.current;
  if(!navigator.geolocation){
   setLocationStatus("error");setLocationMessage("Location detection is not supported by this browser.");return;
  }
  setLocationStatus("locating");setLocationMessage("Finding your nearby town or village…");
  navigator.geolocation.getCurrentPosition(async position=>{
   const lat=position.coords.latitude,lon=position.coords.longitude;
   try{
    const [weatherResponse,placeResponse]=await Promise.all([
     fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`,{cache:"no-store"}),
     fetch(`${API}/api/location/reverse?latitude=${lat}&longitude=${lon}`,{cache:"no-store"})
    ]);
    if(!weatherResponse.ok)throw new Error("Local weather is temporarily unavailable.");
    const weatherData=await weatherResponse.json();
    const placeData=placeResponse.ok?await placeResponse.json():null;
    if(requestVersion!==locationRequestVersion.current)return;
    const name=placeData?.name||"Your nearby area";
    const region=placeData?.region||"GPS location";
    setLocal({name,region,lat,lon,current:weatherData.current||{}});
    setIsSearchLocation(false);
    
    setLocationStatus("ready");setLocationMessage("");
   }catch(error){
    setLocationStatus("error");setLocationMessage(error instanceof Error?error.message:"Could not load your local weather.");
   }
  },error=>{
   if(requestVersion!==locationRequestVersion.current)return;
   if(error.code===1){setLocationStatus("denied");setLocationMessage("Location permission is off. Allow location access to see weather for your current town or village.");}
   else if(error.code===3){setLocationStatus("error");setLocationMessage("Location request timed out. Please try again.");}
   else{setLocationStatus("error");setLocationMessage("Your current location could not be detected. Please try again.");}
  },{enableHighAccuracy:true,timeout:20000,maximumAge:300000});
 };

 useEffect(()=>{if(locationStarted.current)return;locationStarted.current=true;detectLocalWeather()},[]);
 const refreshWeather=async(origin:Place)=>{
  setBusy(true);
  try{
   const country=origin.region.split(",").map(part=>part.trim()).filter(Boolean).pop()||"Unknown";
   const url=`${API}/api/weather/featured?latitude=${origin.lat}&longitude=${origin.lon}&country=${encodeURIComponent(country)}`;
   const response=await fetch(url,{cache:"no-store"});
   if(!response.ok)throw new Error(`Featured weather API returned HTTP ${response.status}`);
   const payload=await response.json();
   if(!Array.isArray(payload.reports)||payload.reports.length===0)throw new Error("No featured city reports returned");
   const rows:Place[]=payload.reports.map((item:any)=>({
    name:item.name,region:item.scope==="national"?`${item.country} · National`:`${item.country} · Nearby international`,
    lat:item.lat,lon:item.lon,current:item.current||{},loading:false,error:!item.current
   }));
   setCities(rows);setUpdated(payload.retrieved_at||new Date().toISOString());
  }catch{
   // Keep the previous successful city set visible if the personalized refresh fails.
   setCities(previous=>previous.map(city=>({...city,loading:false,error:!city.current})));
  }finally{setBusy(false);}
 };
 useEffect(()=>{
  if(!local)return;
  void refreshWeather(local);
  const id=window.setInterval(()=>void refreshWeather(local),5*60*1000);
  return()=>window.clearInterval(id);
 },[local?.lat,local?.lon,local?.name,local?.region]);
 const refreshFeeds=async()=>{
  try{
   const [c,india,world]=await Promise.all([fetch(`${API}/api/cyclones`,{cache:"no-store"}),fetch(`${API}/api/weather-news?region=india&limit=30`,{cache:"no-store"}),fetch(`${API}/api/weather-news?region=world&limit=30`,{cache:"no-store"})]);
   if(c.ok){const d=await c.json();setStorms(d.events||[]);}
   if(india.ok){const d=await india.json();setIndiaNews(d.articles||[]);}if(world.ok){const d=await world.json();setWorldNews(d.articles||[]);}
  }catch{setNotice("Some live weather or headline feeds are temporarily unavailable.");}
 };
 useEffect(()=>{void refreshFeeds();const newsId=window.setInterval(()=>void refreshFeeds(),5*60*1000);const clockId=window.setInterval(()=>setClock(new Date()),1000);return()=>{window.clearInterval(newsId);window.clearInterval(clockId)}},[]);

 useEffect(()=>{
  if(!local)return;
  const {lat,lon,name,region}=local;
  const refreshLocal=async()=>{try{const r=await fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`,{cache:"no-store"});if(!r.ok)return;const d=await r.json();setLocal(prev=>prev?{...prev,name,region,lat,lon,current:d.current||prev.current}:prev);}catch{/* retain the last good location report */}};
  const id=window.setInterval(()=>void refreshLocal(),60*1000);
  return()=>window.clearInterval(id);
 },[local?.lat,local?.lon,local?.name,local?.region]);

 const active=cities.filter(c=>c.current);
 const hottest=useMemo(()=>[...active].sort((a,b)=>(b.current?.temperature_2m??-100)-(a.current?.temperature_2m??-100))[0],[active]);
 const headlines=newsRegion==="india"?indiaNews:worldNews;
 const search=async()=>{if(!query.trim())return;const requestVersion=++locationRequestVersion.current;try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,{headers:{"Accept-Language":"en"}});const d=await r.json();if(requestVersion!==locationRequestVersion.current)return;if(!d.length)throw new Error("No matching place found");const p={name:d[0].name||query,region:d[0].display_name,lat:Number(d[0].lat),lon:Number(d[0].lon)};const w=await fetch(`${API}/api/weather?latitude=${p.lat}&longitude=${p.lon}`);if(requestVersion!==locationRequestVersion.current)return;if(!w.ok)throw new Error("Weather feed unavailable");const wd=await w.json();if(requestVersion!==locationRequestVersion.current)return;setLocal({...p,current:wd.current||{}});setIsSearchLocation(true);setLocationStatus("ready");setLocationMessage("");setNotice("");}catch(e){if(requestVersion!==locationRequestVersion.current)return;setNotice(e instanceof Error?e.message:"Search failed.");}};
 const signIn=async()=>{if(!auth)return;try{await signInWithPopup(auth,googleProvider)}catch{setNotice("Google sign-in could not be completed.")}};
 return <div className="news-site">
  <div className="breaking-strip"><div className="breaking-label">WEATHER BULLETIN</div><div className="ticker"><span>GLOBAL WEATHER DESK</span><i>•</i><span>LIVE MODEL UPDATES</span><i>•</i><span>INDIA & WORLD WEATHER HEADLINES</span><i>•</i><span>WEATHER CHECK EVERY 60 SECONDS</span></div><div className="utc-clock">{clock.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})} LOCAL</div></div>
  <header className="masthead"><div className="brand-lockup"><img className="brand-wordmark" src="https://raw.githubusercontent.com/MohammedRiyashB/earthweatherchannel/main/logo.png" alt="EARTH WEATHER" width="1200" height="220" /></div><div className="masthead-center"><span className="on-air"><b/> LIVE WEATHER DESK</span><small>Global reports · Forecasts · Weather headlines</small></div><div className="masthead-actions">{user?<button onClick={()=>void signOut(auth!)}>{user.displayName||"Account"}</button>:<button onClick={()=>void signIn()}>Sign in</button>}</div></header>
  <nav className="news-nav">{["Weather Report","World","Asia","India","Americas","Europe","Africa","Oceania","Satellite","Forecast"].map(x=><button className={section===x?"active":""} key={x} onClick={()=>{setSection(x);if(x==="India"||x==="Asia")setNewsRegion("india");else if(x!=="Weather Report")setNewsRegion("world")}}>{x}</button>)}</nav>
  <main className="news-main">
   {notice&&<div className="notice">{notice}</div>}
   <div className="news-toolbar"><div><span className="eyebrow">GLOBAL WEATHER COVERAGE</span><h1>Weather around the world</h1><p>Live weather conditions, forecasts and weather-only news from India and around the world.</p></div><form className="search-weather" onSubmit={e=>{e.preventDefault();void search()}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search city or region" aria-label="Search city or region"/><button type="submit">Search</button></form></div>

   <section className="local-weather-card" aria-live="polite">
    <div className="local-weather-heading">
     <div><span className="eyebrow">{isSearchLocation ? "SELECTED CITY" : "WEATHER NEAR YOU"}</span><h2>{isSearchLocation && local ? `Weather in ${local.name}` : "Your current location"}</h2><p>{isSearchLocation ? "Showing weather for the city you searched" : "Automatically detected using your device location"}</p></div>
     <button className="location-refresh" onClick={detectLocalWeather} disabled={locationStatus==="locating"}>{locationStatus==="locating"?"Detecting…":isSearchLocation?"⌖ Return to my location":"⌖ Detect location"}</button>
    </div>
    {local&&locationStatus==="ready"?<>
     <div className={`local-weather-place weather-scene ${weatherScene(local.current?.weather_code,local.current?.cloud_cover)}`}><span className="weather-sky-art" aria-hidden="true"><i/><i/><i/></span>
      <div><h3>{local.name}</h3><p>{local.region}</p></div>
      <div className="local-temperature"><span>{icon(local.current?.weather_code)}</span><strong>{local.current?.temperature_2m!=null?Math.round(local.current.temperature_2m)+"°C":"—"}</strong><small>{weatherLabel(local.current?.weather_code)}</small></div>
     </div>
     <div className="local-weather-stats">
      <div><span>Humidity</span><strong>{local.current?.relative_humidity_2m!=null?local.current.relative_humidity_2m+"%":"—"}</strong></div>
      <div><span>Wind</span><strong>{local.current?.wind_speed_10m!=null?local.current.wind_speed_10m+" km/h":"—"}</strong></div>
      <div><span>Cloud cover</span><strong>{local.current?.cloud_cover!=null?local.current.cloud_cover+"%":"—"}</strong></div>
     </div>
     <div className="local-weather-foot">Weather model time: {modelTime(local.current?.time)} · Place name: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></div>
    </>:<div className="local-weather-prompt"><span>{locationMessage}</span><button onClick={detectLocalWeather} disabled={locationStatus==="locating"}>{locationStatus==="denied"?"Try location again":"Retry location"}</button></div>}
   </section>

   <section className="lead-grid">
    <aside className="top-brief"><div className="section-heading"><h2>Weather briefing</h2><span>GLOBAL</span></div>{hottest&&<div className="brief-highlight"><small>WARMEST IN THIS CITY WATCHLIST</small><b>{hottest.name}</b><strong>{Math.round(hottest.current?.temperature_2m??0)}°C</strong><span>{weatherLabel(hottest.current?.weather_code)}</span></div>}<div className="brief-line"><span>Active severe-storm events</span><b>{storms.length}</b></div><div className="brief-line"><span>Reporting locations</span><b>{active.length}/{cities.length}</b></div><div className="brief-line"><span>Weather headlines</span><b>{indiaNews.length+worldNews.length}</b></div><div className="brief-line"><span>Auto refresh</span><b>{busy?"Updating":"Every 60 seconds"}</b></div><button className="refresh-button" onClick={()=>{void refreshWeather();void refreshFeeds()}} disabled={busy}>{busy?"Refreshing…":"↻ Refresh live reports"}</button></aside>
   </section>
   <section className="section-block"><div className="section-heading"><div><span className="eyebrow">WEATHER NEWS ONLY · PAST 24 HOURS</span><h2>Latest weather headlines</h2></div><div className="news-tabs"><button className={newsRegion==="india"?"selected":""} onClick={()=>setNewsRegion("india")}>India</button><button className={newsRegion==="world"?"selected":""} onClick={()=>setNewsRegion("world")}>World</button></div></div><div className="headline-grid">{headlines.length?headlines.slice(0,18).map((s,i)=><article className="headline-card" key={s.url}><div className="headline-index">{String(i+1).padStart(2,"0")}</div><div className="headline-content"><span>{s.source} · {published(s.published_at)}</span><h3><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></h3><small>{s.language||"Publisher report"}</small></div></article>):<div className="empty-report">Loading weather headlines or no matching reports were returned in the last 24 hours.</div>}</div><p className="feed-note">Headlines are aggregated from publicly indexed news publishers through GDELT. This is not a complete feed from every TV channel or newspaper; availability depends on publisher indexing. Open the publisher link for the original article.</p></section>
   <section className="section-block"><div className="section-heading"><div><span className="eyebrow">WORLDWIDE CITY REPORTS</span><h2>Live weather across the world</h2></div><span className="updated-label">LAST CHECKED · {updated?stamp(updated):"LOADING"} · LOCAL</span></div><div className="city-grid">{cities.map(c=><article className={`city-card weather-scene ${weatherScene(c.current?.weather_code,c.current?.cloud_cover)}`} key={c.name}><span className="weather-sky-art" aria-hidden="true"><i/><i/><i/></span><div className="city-top"><div><small>{c.region}</small><h3>{c.name}</h3></div><span className="weather-icon">{icon(c.current?.weather_code)}</span></div>{c.loading?<div className="city-loading">Loading report…</div>:c.error?<div className="city-loading">Report temporarily unavailable</div>:<><div className="city-temp">{Math.round(c.current?.temperature_2m??0)}<sup>°C</sup></div><div className="city-condition">{weatherLabel(c.current?.weather_code)}</div><div className="city-stats"><span>Humidity <b>{c.current?.relative_humidity_2m??"—"}%</b></span><span>Wind <b>{c.current?.wind_speed_10m??"—"} km/h</b></span><span>Cloud <b>{c.current?.cloud_cover??"—"}%</b></span></div><div className="city-observed">Model time: {c.current?.time?new Date(c.current.time+"Z").toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"})+" UTC":"—"}</div></>}</article>)}</div></section>
   <section className="section-block"><div><div className="section-heading"><div><span className="eyebrow">SEVERE WEATHER WATCH</span><h2>Storm & event reports</h2></div><span className="source-tag">NASA EONET</span></div>{storms.length?storms.slice(0,8).map(s=><article className="event-row" key={s.id}><div className="event-mark">!</div><div><h3>{s.title}</h3><p>{s.description||"A severe-weather event is listed in the NASA EONET event catalogue."}</p><small>EVENT CATALOGUE · {s.coordinates?.length||0} mapped positions</small></div>{s.link&&<a href={s.link} target="_blank" rel="noreferrer">Source ↗</a>}</article>):<div className="empty-report">No active severe-storm event entries were returned by the current event feed. This does not mean there is no severe weather.</div>}</div>
    
   </section>
  </main>
  <footer className="news-footer"><div className="footer-brand">EARTH WEATHER <span>GLOBAL WEATHER NEWSROOM</span></div><div>Weather reporting only · No general political or entertainment news</div><div>Weather models: Open-Meteo · Events: NASA EONET · Headlines: GDELT publisher index</div></footer>
 </div>;
}
