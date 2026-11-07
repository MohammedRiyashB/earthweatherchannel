import { useEffect, useMemo, useRef, useState } from "react";
import { auth, firebaseReady, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";

const API=import.meta.env.VITE_API_BASE_URL||"https://earthweather-api.onrender.com";
type Current={time?:string;temperature_2m?:number;relative_humidity_2m?:number;apparent_temperature?:number;precipitation?:number;cloud_cover?:number;pressure_msl?:number;wind_speed_10m?:number;wind_direction_10m?:number;weather_code?:number};
type Place={name:string;region:string;lat:number;lon:number;country?:string;country_code?:string;current?:Current;loading?:boolean;error?:boolean};
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

const CACHE_PREFIX="earth-weather-v2:";
function readCache<T>(key:string,fallback:T):T{try{const raw=localStorage.getItem(CACHE_PREFIX+key);if(!raw)return fallback;const parsed=JSON.parse(raw);return parsed?.value??fallback;}catch{return fallback;}}
function writeCache<T>(key:string,value:T){try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({value,savedAt:Date.now()}));}catch{/* storage may be unavailable or full */}}
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
 const [cities,setCities]=useState<Place[]>(()=>readCache<Place[]>("cities",CITIES.map(x=>({...x,loading:true}))));
 const [storms,setStorms]=useState<Storm[]>(()=>readCache<Storm[]>("storms",[]));
 const [indiaNews,setIndiaNews]=useState<Story[]>(()=>readCache<Story[]>("india-news",[]));const [worldNews,setWorldNews]=useState<Story[]>(()=>readCache<Story[]>("world-news",[]));
 const [newsRegion,setNewsRegion]=useState<"india"|"world">("india");
 const [updated,setUpdated]=useState("");const [clock,setClock]=useState(new Date());const [busy,setBusy]=useState(false);const [query,setQuery]=useState("");
const [section,setSection]=useState("Weather Report");const [page,setPage]=useState<"home"|"about"|"terms"|"privacy">("home");const [isSearchLocation,setIsSearchLocation]=useState(false);
 const [user,setUser]=useState<User|null>(null);const [notice,setNotice]=useState("");
 const [local,setLocal]=useState<Place|null>(()=>readCache<Place|null>("local",null));
 const [visitorLocation,setVisitorLocation]=useState<Place|null>(()=>readCache<Place|null>("visitor-location",null));
 const [personalizedCities,setPersonalizedCities]=useState(false);
 const [locationStatus,setLocationStatus]=useState<"locating"|"ready"|"denied"|"error">(()=>readCache<Place|null>("local",null)?"ready":"locating");
 const [locationMessage,setLocationMessage]=useState(()=>readCache<Place|null>("local",null)?"":"Finding your nearby town or village…");
 const locationStarted=useRef(false);
 const locationRequestVersion=useRef(0);
 const cityRequestVersion=useRef(0);
 useEffect(()=>{if(!auth||!firebaseReady)return;return onAuthStateChanged(auth,setUser)},[]);

 const detectLocalWeather=()=>{
  const requestVersion=++locationRequestVersion.current;
  if(!navigator.geolocation){
   setLocationStatus("error");setLocationMessage("Location detection is not supported by this browser.");return;
  }
  setLocationStatus("locating");setLocationMessage(local?"Refreshing your location in the background…":"Finding your nearby town or village…");
  navigator.geolocation.getCurrentPosition(async position=>{
   const lat=position.coords.latitude,lon=position.coords.longitude;
   try{
    // Weather is the primary result. Reverse-geocoding is optional and must
    // never hide a valid GPS weather response when the place-name service fails.
    const weatherResponse=await fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`,{cache:"no-store"});
    if(!weatherResponse.ok)throw new Error(`Weather service returned HTTP ${weatherResponse.status}`);
    const weatherData=await weatherResponse.json();
    if(requestVersion!==locationRequestVersion.current)return;
    const fallbackPlace:Place={name:"Your nearby area",region:"GPS coordinates",lat,lon,current:weatherData.current||{}};
    setLocal(fallbackPlace);writeCache("local",fallbackPlace);
    setIsSearchLocation(false);
    setLocationStatus("ready");setLocationMessage("");

    try{
     const placeResponse=await fetch(`${API}/api/location/reverse?latitude=${lat}&longitude=${lon}`,{cache:"no-store"});
     if(placeResponse.ok){
      const placeData=await placeResponse.json();
      if(requestVersion!==locationRequestVersion.current)return;
      const visitor:Place={name:placeData?.name||"Your nearby area",region:placeData?.region||placeData?.country||"GPS location",lat,lon,country:placeData?.country||undefined,country_code:placeData?.country_code||undefined};
      setLocal({...visitor,current:weatherData.current||{}});
      if(visitor.country)setVisitorLocation(visitor);
     }
    }catch{
     // Keep the valid weather report and coordinates; place-name lookup can retry later.
    }
   }catch(error){
    if(requestVersion!==locationRequestVersion.current)return;
    setLocationStatus("error");setLocationMessage(error instanceof Error?error.message:"Could not load your local weather.");
   }
  },error=>{
   if(requestVersion!==locationRequestVersion.current)return;
   if(error.code===1){setLocationStatus("denied");setLocationMessage("Location permission is off. Allow location access to see weather for your current town or village.");}
   else if(error.code===3){setLocationStatus("error");setLocationMessage("Location request timed out. Please try again.");}
   else{setLocationStatus("error");setLocationMessage("Your current location could not be detected. Please try again.");}
  },{enableHighAccuracy:false,timeout:7000,maximumAge:600000});
 };

 useEffect(()=>{if(locationStarted.current)return;locationStarted.current=true;if(!local)detectLocalWeather()},[]);
 const refreshWeather=async(origin:Place)=>{
  const requestVersion=++cityRequestVersion.current;
  setBusy(true);
  try{
   const country=origin.country||origin.region.split(",").map(part=>part.trim()).filter(Boolean).pop()||"Unknown";
   const url=`${API}/api/weather/featured?latitude=${origin.lat}&longitude=${origin.lon}&country=${encodeURIComponent(country)}`;
   const response=await fetch(url,{cache:"no-store"});
   if(!response.ok)throw new Error(`Featured weather API returned HTTP ${response.status}`);
   const payload=await response.json();
   if(!Array.isArray(payload.reports)||payload.reports.length===0)throw new Error("No featured city reports returned");
   if(requestVersion!==cityRequestVersion.current)return;
   const rows:Place[]=payload.reports.map((item:any)=>({
    name:item.name,
    country:item.country,
    region:item.scope==="national"?`${item.country} · National`:item.scope==="regional"?`${item.country} · Regional reference`:`${item.country} · Nearby international`,
    lat:item.lat,lon:item.lon,current:item.current||{},loading:false,error:!item.current
   }));
   setCities(rows);writeCache("cities",rows);setPersonalizedCities(true);setUpdated(payload.retrieved_at||new Date().toISOString());
  }catch{
   if(requestVersion===cityRequestVersion.current)setCities(previous=>previous.map(city=>({...city,loading:false,error:!city.current})));
  }finally{if(requestVersion===cityRequestVersion.current)setBusy(false);}
 };
 const refreshPopularCities=async()=>{
  const requestVersion=++cityRequestVersion.current;
  setBusy(true);
  try{
   const latitudes=CITIES.map(city=>city.lat).join(",");
   const longitudes=CITIES.map(city=>city.lon).join(",");
   const response=await fetch(`${API}/api/weather/bulk?latitudes=${encodeURIComponent(latitudes)}&longitudes=${encodeURIComponent(longitudes)}`,{cache:"no-store"});
   if(!response.ok)throw new Error("Bulk weather endpoint unavailable");
   const payload=await response.json();
   if(!Array.isArray(payload.reports)||payload.reports.length!==CITIES.length)throw new Error("Incomplete popular city response");
   if(requestVersion!==cityRequestVersion.current)return;
   const rows=CITIES.map((city,index)=>({...city,current:payload.reports[index]?.current||{},loading:false,error:!payload.reports[index]?.current}));setCities(rows);writeCache("cities",rows);
   setPersonalizedCities(false);setUpdated(payload.retrieved_at||new Date().toISOString());
  }catch{\n   // Keep cached reports; avoid a slow fan-out of 12 individual requests.\n   if(requestVersion===cityRequestVersion.current)setCities(previous=>previous.map(city=>({...city,loading:false,error:!city.current})));\n  }finally{if(requestVersion===cityRequestVersion.current)setBusy(false);}
 };
 useEffect(()=>{
  if(!visitorLocation)return;
  void refreshWeather(visitorLocation);
  const id=window.setInterval(()=>void refreshWeather(visitorLocation),5*60*1000);
  return()=>window.clearInterval(id);
 },[visitorLocation?.lat,visitorLocation?.lon,visitorLocation?.country,visitorLocation?.region]);
 const refreshFeeds=async()=>{
  try{
   const [c,india,world]=await Promise.all([fetch(`${API}/api/cyclones`,{cache:"no-store"}),fetch(`${API}/api/weather-news?region=india&limit=30`,{cache:"no-store"}),fetch(`${API}/api/weather-news?region=world&limit=30`,{cache:"no-store"})]);
   if(c.ok){const d=await c.json();setStorms(d.events||[]);writeCache("storms",d.events||[]);}
   if(india.ok){const d=await india.json();setIndiaNews(d.articles||[]);writeCache("india-news",d.articles||[]);}if(world.ok){const d=await world.json();setWorldNews(d.articles||[]);writeCache("world-news",d.articles||[]);}
  }catch{setNotice("Some live weather or headline feeds are temporarily unavailable.");}
 };
 useEffect(()=>{void refreshPopularCities();void refreshFeeds();const newsId=window.setInterval(()=>void refreshFeeds(),5*60*1000);const clockId=window.setInterval(()=>setClock(new Date()),1000);return()=>{window.clearInterval(newsId);window.clearInterval(clockId)}},[]);

 useEffect(()=>{
  if(!local)return;
  const {lat,lon,name,region}=local;
  const refreshLocal=async()=>{try{const r=await fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`,{cache:"no-store"});if(!r.ok)return;const d=await r.json();setLocal(prev=>{const next=prev?{...prev,name,region,lat,lon,current:d.current||prev.current}:prev;if(next)writeCache("local",next);return next;});}catch{/* retain the last good location report */}};
  const id=window.setInterval(()=>void refreshLocal(),60*1000);
  return()=>window.clearInterval(id);
 },[local?.lat,local?.lon,local?.name,local?.region]);

 const active=cities.filter(c=>c.current);
 const hottest=useMemo(()=>[...active].sort((a,b)=>(b.current?.temperature_2m??-100)-(a.current?.temperature_2m??-100))[0],[active]);
 const headlines=newsRegion==="india"?indiaNews:worldNews;
 const nationalCities=cities.filter(city=>city.region.endsWith("· National"));
 const regionalCities=cities.filter(city=>city.region.endsWith("· Regional reference"));
 const internationalCities=cities.filter(city=>city.region.endsWith("· Nearby international"));
 const renderCityCards=(items:Place[])=>items.map(c=><article className={`city-card weather-scene ${weatherScene(c.current?.weather_code,c.current?.cloud_cover)}`} key={c.name}><span className="weather-sky-art" aria-hidden="true"><i/><i/><i/></span><div className="city-top"><div><small>{c.region}</small><h3>{c.name}</h3></div><span className="weather-icon">{icon(c.current?.weather_code)}</span></div>{c.loading?<div className="city-loading">Loading report…</div>:c.error?<div className="city-loading">Report temporarily unavailable</div>:<><div className="city-temp">{Math.round(c.current?.temperature_2m??0)}<sup>°C</sup></div><div className="city-condition">{weatherLabel(c.current?.weather_code)}</div><div className="city-stats"><span>Humidity <b>{c.current?.relative_humidity_2m??"—"}%</b></span><span>Wind <b>{c.current?.wind_speed_10m??"—"} km/h</b></span><span>Cloud <b>{c.current?.cloud_cover??"—"}%</b></span></div><div className="city-observed">Model time: {c.current?.time?new Date(c.current.time+"Z").toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"})+" UTC":"—"}</div></>}</article>);
 const search=async()=>{if(!query.trim())return;const requestVersion=++locationRequestVersion.current;try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,{headers:{"Accept-Language":"en"}});const d=await r.json();if(requestVersion!==locationRequestVersion.current)return;if(!d.length)throw new Error("No matching place found");const p={name:d[0].name||query,region:d[0].display_name,country:d[0].display_name.split(",").map((part:string)=>part.trim()).filter(Boolean).pop(),lat:Number(d[0].lat),lon:Number(d[0].lon)};const w=await fetch(`${API}/api/weather?latitude=${p.lat}&longitude=${p.lon}`);if(requestVersion!==locationRequestVersion.current)return;if(!w.ok)throw new Error("Weather feed unavailable");const wd=await w.json();if(requestVersion!==locationRequestVersion.current)return;setLocal({...p,current:wd.current||{}});writeCache("local",{...p,current:wd.current||{}});setIsSearchLocation(true);setLocationStatus("ready");setLocationMessage("");setNotice("");}catch(e){if(requestVersion!==locationRequestVersion.current)return;setNotice(e instanceof Error?e.message:"Search failed.");}};
 const signIn=async()=>{if(!auth)return;try{await signInWithPopup(auth,googleProvider)}catch{setNotice("Google sign-in could not be completed.")}};
 return <div className="news-site">
  <div className="breaking-strip"><div className="breaking-label">WEATHER BULLETIN</div><div className="ticker"><span>GLOBAL WEATHER DESK</span><i>•</i><span>LIVE MODEL UPDATES</span><i>•</i><span>INDIA & WORLD WEATHER HEADLINES</span><i>•</i><span>WEATHER CHECK EVERY 60 SECONDS</span></div><div className="utc-clock">{clock.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})} LOCAL</div></div>
  <header className="masthead"><div className="brand-lockup"><img className="brand-wordmark" src="https://raw.githubusercontent.com/MohammedRiyashB/earthweatherchannel/main/logo.png" alt="EARTH WEATHER" width="1200" height="220" /></div><div className="masthead-center"><span className="on-air"><b/> LIVE WEATHER DESK</span><small>Global reports · Forecasts · Weather headlines</small></div><div className="masthead-actions">{user?<button onClick={()=>void signOut(auth!)}>{user.displayName||"Account"}</button>:<button onClick={()=>void signIn()}>Sign in</button>}</div></header>
  <nav className="news-nav">{["Weather Report","World","Asia","India","Americas","Europe","Africa","Oceania","Satellite","Forecast"].map(x=><button className={section===x?"active":""} key={x} onClick={()=>{setSection(x);if(x==="India"||x==="Asia")setNewsRegion("india");else if(x!=="Weather Report")setNewsRegion("world")}}>{x}</button>)}</nav>
  {page==="home"?<main className="news-main">
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
    <aside className="top-brief"><div className="section-heading"><h2>Weather briefing</h2><span>GLOBAL</span></div>{hottest&&<div className="brief-highlight"><small>WARMEST IN THIS CITY WATCHLIST</small><b>{hottest.name}</b><strong>{Math.round(hottest.current?.temperature_2m??0)}°C</strong><span>{weatherLabel(hottest.current?.weather_code)}</span></div>}<div className="brief-line"><span>Active severe-storm events</span><b>{storms.length}</b></div><div className="brief-line"><span>Reporting locations</span><b>{active.length}/{cities.length}</b></div><div className="brief-line"><span>Weather headlines</span><b>{indiaNews.length+worldNews.length}</b></div><div className="brief-line"><span>Auto refresh</span><b>{busy?"Updating":visitorLocation?"Every 5 minutes":"Global fallback"}</b></div><button className="refresh-button" onClick={()=>{if(visitorLocation)void refreshWeather(visitorLocation);else void refreshPopularCities();void refreshFeeds()}} disabled={busy}>{busy?"Refreshing…":"↻ Refresh live reports"}</button></aside>
   </section>
   <section className="section-block">
    <div className="section-heading">
     <div><span className="eyebrow">WEATHER NEWS ONLY · PAST 24 HOURS</span><h2>Latest weather headlines</h2></div>
     <div className="news-tabs">
      <button className={newsRegion==="india"?"selected":""} onClick={()=>setNewsRegion("india")}>India</button>
      <button className={newsRegion==="world"?"selected":""} onClick={()=>setNewsRegion("world")}>World</button>
     </div>
    </div>
    <div className="headline-grid">
     {headlines.length?headlines.slice(0,18).map((s,i)=><article className="headline-card" key={s.url}>
      <div className="headline-index">{String(i+1).padStart(2,"0")}</div>
      <div className="headline-content"><span>{s.source} · {published(s.published_at)}</span><h3><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></h3><small>{s.language||"Publisher report"}</small></div>
     </article>):<div className="empty-report">Loading weather headlines or no matching reports were returned in the last 24 hours.</div>}
    </div>
    <p className="feed-note">Headlines are aggregated from publicly indexed news publishers through GDELT. This is not a complete feed from every TV channel or newspaper; availability depends on publisher indexing. Open the publisher link for the original article.</p>
   </section>

   <section className="section-block">
    <div className="section-heading">
     <div>
      <span className="eyebrow">{personalizedCities?"NATIONAL & INTERNATIONAL CITY REPORTS":"GLOBAL CITY WATCHLIST"}</span>
      <h2>{personalizedCities?"Weather for your country and nearby regions":"Live weather across the world"}</h2>
     </div>
     <span className="updated-label">LAST CHECKED · {updated?stamp(updated):"LOADING"} · LOCAL</span>
    </div>
    {personalizedCities?<div className="city-report-groups">
     {nationalCities.length>0&&<div className="city-report-group"><div className="city-group-heading">National · {visitorLocation?.country||"Your country"}</div><div className="city-grid">{renderCityCards(nationalCities)}</div></div>}
     {regionalCities.length>0&&<div className="city-report-group"><div className="city-group-heading">Nearby regional cities</div><div className="city-grid">{renderCityCards(regionalCities)}</div></div>}
     {internationalCities.length>0&&<div className="city-report-group"><div className="city-group-heading">Nearby international cities</div><div className="city-grid">{renderCityCards(internationalCities)}</div></div>}
    </div>:<div className="city-grid">{renderCityCards(cities)}</div>}
   </section>

   <section className="section-block"><div><div className="section-heading"><div><span className="eyebrow">SEVERE WEATHER WATCH</span><h2>Storm & event reports</h2></div><span className="source-tag">NASA EONET</span></div>{storms.length?storms.slice(0,8).map(s=><article className="event-row" key={s.id}><div className="event-mark">!</div><div><h3>{s.title}</h3><p>{s.description||"A severe-weather event is listed in the NASA EONET event catalogue."}</p><small>EVENT CATALOGUE · {s.coordinates?.length||0} mapped positions</small></div>{s.link&&<a href={s.link} target="_blank" rel="noreferrer">Source ↗</a>}</article>):<div className="empty-report">No active severe-storm event entries were returned by the current event feed. This does not mean there is no severe weather.</div>}</div>
    
   </section>
  </main>
  :<main className="news-main info-page">
   <div className="info-page-brand"><img src="https://raw.githubusercontent.com/MohammedRiyashB/earthweatherchannel/main/logo.png" alt="EARTH WEATHER" /></div>
   {page==="about"?<article className="info-card">
    <span className="eyebrow">ABOUT EARTH WEATHER</span>
    <h1>Weather information for a connected world.</h1>
    <p className="info-lead">EARTH WEATHER CHANNEL is an independent weather information platform created to make weather conditions, forecasts and weather-related updates easier to access across locations.</p>
    <div className="founder-panel"><span>FOUNDER OF EARTH WEATHER CHANNEL</span><h2>Mohammed Riyash B</h2><p>Founder · BMR INC.</p></div>
    <h2>Why we created Earth Weather</h2>
    <p>Our purpose is to bring useful weather information into one clear place: local conditions, city reports, forecasts, severe-weather information and weather-only headlines. We want people to understand the weather around them and the conditions affecting communities around the world.</p>
    <h2>Live weather updates</h2>
    <p>Weather conditions and city reports are retrieved from connected weather data services and refreshed periodically. Forecasts and current conditions are model or provider products; update times and coverage can differ by location and source.</p>
    <h2>Satellite data and monitoring</h2>
    <p>Our backend maintains a catalogue of <strong>7 satellite data provider groups</strong>, including public and account-dependent services. This is a catalogue of available data sources and missions—not a claim that seven satellites, or every listed satellite, are directly connected to a live feed. Actual imagery access depends on provider availability, product coverage, permissions and processing.</p>
    <div className="info-note"><strong>Data transparency</strong><span>We distinguish provider connectivity from actual data retrieval and processing. Satellite imagery is not presented as a direct measurement of every weather value.</span></div>
    <h2>Our mission</h2>
    <p>To make timely, understandable weather information more accessible and help people make better-informed everyday decisions about weather and safety.</p>
    <h2>Our vision</h2>
    <p>To build a dependable, globally accessible weather information platform that brings together trusted data sources, clear reporting and responsible technology.</p>
    <p className="info-attribution">EARTH WEATHER CHANNEL · An initiative of BMR INC.</p>
   </article>:page==="terms"?<article className="info-card">
    <span className="eyebrow">LEGAL INFORMATION</span><h1>Terms and Conditions</h1>
    <p className="info-lead">By accessing EARTH WEATHER CHANNEL, you agree to use this website responsibly and in accordance with these terms.</p>
    <h2>Weather information</h2><p>Weather observations, forecasts, model outputs, satellite products and alerts may be delayed, incomplete or unavailable. They are provided for general information and should not be treated as a substitute for official emergency instructions or professional advice.</p>
    <h2>Third-party data</h2><p>Some information is supplied by third-party providers. Their coverage, update schedules, availability, attribution and usage conditions may apply independently.</p>
    <h2>Responsible use</h2><p>Do not misuse the website, interfere with its services, attempt unauthorized access or rely on this platform as the sole source for decisions involving personal safety or property.</p>
    <h2>Availability and changes</h2><p>We may update, modify or temporarily suspend parts of the website to maintain or improve the service. These terms may also be updated as the platform develops.</p>
    <h2>Contact</h2><p>For questions about these terms, contact the EARTH WEATHER CHANNEL team through the official contact details published by BMR INC.</p>
   </article>:<article className="info-card">
    <span className="eyebrow">YOUR INFORMATION</span><h1>Privacy Policy</h1>
    <p className="info-lead">This page explains, in general terms, how EARTH WEATHER CHANNEL handles information when you use the website.</p>
    <h2>Location access</h2><p>If you choose to allow browser location access, your device coordinates are used to request weather for your current area and identify a nearby place. You can deny or revoke location permission in your browser settings and use city search instead.</p>
    <h2>Account sign-in</h2><p>If you choose Google sign-in, authentication is handled through Firebase Authentication. Google and Firebase may process information under their own privacy terms.</p>
    <h2>Weather requests and technical data</h2><p>Weather searches and API requests may transmit the requested place or coordinates to the weather services needed to return the report. Hosting and service providers may process standard technical logs for security and operation.</p>
    <h2>Third-party services</h2><p>The website may use third-party weather, geocoding, news-indexing, satellite-data and authentication services. Their own privacy policies and terms govern their services.</p>
    <h2>Your choices</h2><p>You can use manual city search without granting location permission, sign out of your account, and manage browser permissions through your device settings.</p>
    <h2>Policy updates</h2><p>This policy may be revised as the service and its integrations change. The latest version will be published on this page.</p>
   </article>}
   <button className="back-home" onClick={()=>{setPage("home");window.scrollTo({top:0,behavior:"smooth"})}}>← Back to Weather</button>
  </main>}
  <footer className="news-footer">
   <div className="footer-heading">
    <img className="footer-logo" src="https://raw.githubusercontent.com/MohammedRiyashB/earthweatherchannel/main/logo.png" alt="EARTH WEATHER logo" />
    <div className="footer-brand">EARTH WEATHER <span>GLOBAL WEATHER NEWSROOM</span></div>
   </div>
   <nav className="footer-navigation" aria-label="Footer navigation">
    <div className="footer-links">
     <button onClick={()=>{setPage("about");window.scrollTo({top:0,behavior:"smooth"})}}>About</button>
     <button onClick={()=>{setPage("about");window.scrollTo({top:0,behavior:"smooth"})}}>Our mission &amp; vision</button>
    </div>
    <div className="footer-legal">
     <button onClick={()=>{setPage("terms");window.scrollTo({top:0,behavior:"smooth"})}}>Terms and Conditions</button>
     <button onClick={()=>{setPage("privacy");window.scrollTo({top:0,behavior:"smooth"})}}>Privacy Policy</button>
    </div>
   </nav>
   <div className="footer-copyright">© {new Date().getFullYear()} Earth Weather Channel. All rights reserved. <strong>BMR INC.</strong></div>
  </footer>
 </div>;
}
