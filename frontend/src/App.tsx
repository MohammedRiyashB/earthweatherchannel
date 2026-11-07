import { useEffect, useMemo, useState } from "react";
import { auth, firebaseReady, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";

const API=import.meta.env.VITE_API_BASE_URL||"https://earthweather-api.onrender.com";
type Current={time?:string;temperature_2m?:number;relative_humidity_2m?:number;apparent_temperature?:number;precipitation?:number;cloud_cover?:number;pressure_msl?:number;wind_speed_10m?:number;wind_direction_10m?:number;weather_code?:number};
type Place={name:string;region:string;lat:number;lon:number;current?:Current;loading?:boolean;error?:boolean};
type Storm={id:string;title:string;description?:string;link?:string;coordinates?:{lat:number;lon:number;date?:string}[]};
type Source={id:string;name:string;kind:string;coverage:string;status:string;update:string;note:string};
type Story={title:string;url:string;source:string;published_at?:string;language?:string;image?:string};
const CITIES:Place[]=[
{name:"New Delhi",region:"India",lat:28.6139,lon:77.209},{name:"Chennai",region:"India",lat:13.0827,lon:80.2707},
{name:"Mumbai",region:"India",lat:19.076,lon:72.8777},{name:"London",region:"United Kingdom",lat:51.5072,lon:-0.1276},
{name:"New York",region:"United States",lat:40.7128,lon:-74.006},{name:"Tokyo",region:"Japan",lat:35.6762,lon:139.6503},
{name:"Dubai",region:"UAE",lat:25.2048,lon:55.2708},{name:"Sydney",region:"Australia",lat:-33.8688,lon:151.2093},
{name:"Singapore",region:"Singapore",lat:1.3521,lon:103.8198},{name:"Cape Town",region:"South Africa",lat:-33.9249,lon:18.4241},
{name:"São Paulo",region:"Brazil",lat:-23.5505,lon:-46.6333},{name:"Erode",region:"Tamil Nadu, India",lat:11.341,lon:77.7172}
];
const weatherLabel=(c?:number)=>c==null?"Weather update":c===0?"Clear skies":[1,2,3].includes(c)?"Partly cloudy":[45,48].includes(c)?"Foggy":[51,53,55,56,57].includes(c)?"Drizzle":[61,63,65,66,67,80,81,82].includes(c)?"Rain":[71,73,75,77,85,86].includes(c)?"Snow":[95,96,99].includes(c)?"Thunderstorms":"Variable conditions";
const icon=(c?:number)=>c===0?"☀":c!=null&&[1,2,3].includes(c)?"⛅":c!=null&&[45,48].includes(c)?"🌫":c!=null&&[95,96,99].includes(c)?"⛈":c!=null&&[71,73,75,77,85,86].includes(c)?"❄":"🌧";
const stamp=(s?:string)=>{if(!s)return "—";const d=new Date(s);return Number.isNaN(d.getTime())?"Recently indexed":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});};
const published=(s?:string)=>{if(!s)return "Recently indexed";let d=new Date(s);if(Number.isNaN(d.getTime())&&/^\d{8}T\d{6}Z?$/.test(s)){const x=s.replace(/Z$/,"");d=new Date(Date.UTC(Number(x.slice(0,4)),Number(x.slice(4,6))-1,Number(x.slice(6,8)),Number(x.slice(9,11)),Number(x.slice(11,13)),Number(x.slice(13,15)));}return Number.isNaN(d.getTime())?"Recently indexed":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});};
export default function App(){
 const [cities,setCities]=useState<Place[]>(CITIES.map(x=>({...x,loading:true})));
 const [storms,setStorms]=useState<Storm[]>([]);
 const [indiaNews,setIndiaNews]=useState<Story[]>([]);const [worldNews,setWorldNews]=useState<Story[]>([]);
 const [newsRegion,setNewsRegion]=useState<"india"|"world">("india");
 const [updated,setUpdated]=useState("");const [clock,setClock]=useState(new Date());const [busy,setBusy]=useState(false);const [query,setQuery]=useState("");
 const [searchResult,setSearchResult]=useState<Place|null>(null);const [section,setSection]=useState("Top Stories");
 const [user,setUser]=useState<User|null>(null);const [notice,setNotice]=useState("");
 const [local,setLocal]=useState<Place|null>(null);
 useEffect(()=>{if(!auth||!firebaseReady)return;return onAuthStateChanged(auth,setUser)},[]);
 const refreshWeather=async()=>{
  setBusy(true);
  const rows=await Promise.all(CITIES.map(async p=>{try{const r=await fetch(`${API}/api/weather?latitude=${p.lat}&longitude=${p.lon}`,{cache:"no-store"});if(!r.ok)throw new Error();const d=await r.json();return {...p,current:d.current||{},loading:false}}catch{return {...p,loading:false,error:true}}}));
  setCities(rows);setUpdated(new Date().toISOString());setBusy(false);
 };
 const refreshFeeds=async()=>{
  try{
   const [c,india,world]=await Promise.all([fetch(`${API}/api/cyclones`,{cache:"no-store"}),fetch(`${API}/api/weather-news?region=india&limit=30`,{cache:"no-store"}),fetch(`${API}/api/weather-news?region=world&limit=30`,{cache:"no-store"})]);
   if(c.ok){const d=await c.json();setStorms(d.events||[]);}
   if(india.ok){const d=await india.json();setIndiaNews(d.articles||[]);}if(world.ok){const d=await world.json();setWorldNews(d.articles||[]);}
  }catch{setNotice("Some live weather or headline feeds are temporarily unavailable.");}
 };
 useEffect(()=>{void refreshWeather();void refreshFeeds();const weatherId=window.setInterval(()=>void refreshWeather(),60*1000);const newsId=window.setInterval(()=>void refreshFeeds(),5*60*1000);const clockId=window.setInterval(()=>setClock(new Date()),1000);return()=>{window.clearInterval(weatherId);window.clearInterval(newsId);window.clearInterval(clockId)}},[]);
 const active=cities.filter(c=>c.current);
 const hottest=useMemo(()=>[...active].sort((a,b)=>(b.current?.temperature_2m??-100)-(a.current?.temperature_2m??-100))[0],[active]);
 const headlines=newsRegion==="india"?indiaNews:worldNews;
 const search=async()=>{if(!query.trim())return;try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,{headers:{"Accept-Language":"en"}});const d=await r.json();if(!d.length)throw new Error("No matching place found");const p={name:d[0].name||query,region:d[0].display_name,lat:Number(d[0].lat),lon:Number(d[0].lon)};const w=await fetch(`${API}/api/weather?latitude=${p.lat}&longitude=${p.lon}`);if(!w.ok)throw new Error("Weather feed unavailable");const wd=await w.json();setSearchResult({...p,current:wd.current});setNotice("");}catch(e){setNotice(e instanceof Error?e.message:"Search failed.");}};
 const useMyLocation=()=>navigator.geolocation?.getCurrentPosition(async p=>{const lat=p.coords.latitude,lon=p.coords.longitude;try{const r=await fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`);const d=await r.json();setLocal({name:"Your location",region:"Current position",lat,lon,current:d.current});}catch{setNotice("Could not load local weather.")}},()=>setNotice("Location permission was not granted."));
 const signIn=async()=>{if(!auth)return;try{await signInWithPopup(auth,googleProvider)}catch{setNotice("Google sign-in could not be completed.")}};
 return <div className="news-site">
  <div className="breaking-strip"><div className="breaking-label">WEATHER BULLETIN</div><div className="ticker"><span>GLOBAL WEATHER DESK</span><i>•</i><span>LIVE MODEL UPDATES</span><i>•</i><span>INDIA & WORLD WEATHER HEADLINES</span><i>•</i><span>WEATHER CHECK EVERY 60 SECONDS</span></div><div className="utc-clock">{clock.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})} LOCAL</div></div>
  <header className="masthead"><div className="brand-lockup"><img className="brand-wordmark" src="https://raw.githubusercontent.com/MohammedRiyashB/earthweatherchannel/main/logo.png" alt="EARTH WEATHER" width="1200" height="220" /></div><div className="masthead-center"><span className="on-air"><b/> LIVE WEATHER DESK</span><small>Global reports · Forecasts · Weather headlines</small></div><div className="masthead-actions"><button onClick={useMyLocation}>◎ My weather</button>{user?<button onClick={()=>void signOut(auth!)}>{user.displayName||"Account"}</button>:<button onClick={()=>void signIn()}>Sign in</button>}</div></header>
  <nav className="news-nav">{["Top Stories","World","Asia","India","Americas","Europe","Africa","Oceania","Satellite","Forecast"].map(x=><button className={section===x?"active":""} key={x} onClick={()=>{setSection(x);if(x==="India"||x==="Asia")setNewsRegion("india");else if(x!=="Top Stories")setNewsRegion("world")}}>{x}</button>)}</nav>
  <main className="news-main">
   <section className="news-toolbar"><div><span className="eyebrow">GLOBAL WEATHER COVERAGE</span><h1>{section==="Top Stories"?"Weather around the world":section+" weather desk"}</h1><p>Live weather conditions, forecasts and weather-only news from India and around the world.</p></div><div className="search-weather"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&void search()} placeholder="Search city or region"/><button onClick={()=>void search()}>Search</button></div></section>
   {(searchResult||local)&&<section className="search-result"><div><small>SELECTED LOCATION</small><h2>{(searchResult||local)!.name}</h2><p>{(searchResult||local)!.region}</p></div><strong>{Math.round((searchResult||local)!.current?.temperature_2m??0)}°C</strong><span>{weatherLabel((searchResult||local)!.current?.weather_code)}</span><button onClick={()=>{setSearchResult(null);setLocal(null)}}>×</button></section>}
   {notice&&<div className="notice">{notice}</div>}
   <section className="lead-grid">
    <article className="lead-story"><div className="lead-image"><div className="globe-art">◉</div><div className="image-caption">WORLD WEATHER MONITOR</div></div><div className="lead-copy"><span className="story-category">GLOBAL OVERVIEW · LIVE MODEL</span><h2>Tracking the atmosphere, across every region.</h2><p>Current conditions and near-term forecasts are refreshed from global weather models. Live news headlines are collected separately from indexed publishers.</p><div className="story-meta">DATA DESK <span>Last checked {updated?stamp(updated):"Waiting for first update"} · Device local time</span></div></div></article>
    <aside className="top-brief"><div className="section-heading"><h2>Weather briefing</h2><span>GLOBAL</span></div>{hottest&&<div className="brief-highlight"><small>WARMEST IN THIS CITY WATCHLIST</small><b>{hottest.name}</b><strong>{Math.round(hottest.current?.temperature_2m??0)}°C</strong><span>{weatherLabel(hottest.current?.weather_code)}</span></div>}<div className="brief-line"><span>Active severe-storm events</span><b>{storms.length}</b></div><div className="brief-line"><span>Reporting locations</span><b>{active.length}/{cities.length}</b></div><div className="brief-line"><span>Weather headlines</span><b>{indiaNews.length+worldNews.length}</b></div><div className="brief-line"><span>Auto refresh</span><b>{busy?"Updating":"Every 60 seconds"}</b></div><button className="refresh-button" onClick={()=>{void refreshWeather();void refreshFeeds()}} disabled={busy}>{busy?"Refreshing…":"↻ Refresh live reports"}</button></aside>
   </section>
   <section className="section-block"><div className="section-heading"><div><span className="eyebrow">WEATHER NEWS ONLY · PAST 24 HOURS</span><h2>Latest weather headlines</h2></div><div className="news-tabs"><button className={newsRegion==="india"?"selected":""} onClick={()=>setNewsRegion("india")}>India</button><button className={newsRegion==="world"?"selected":""} onClick={()=>setNewsRegion("world")}>World</button></div></div><div className="headline-grid">{headlines.length?headlines.slice(0,18).map((s,i)=><article className="headline-card" key={s.url}><div className="headline-index">{String(i+1).padStart(2,"0")}</div><div className="headline-content"><span>{s.source} · {published(s.published_at)}</span><h3><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></h3><small>{s.language||"Publisher report"}</small></div></article>):<div className="empty-report">Loading weather headlines or no matching reports were returned in the last 24 hours.</div>}</div><p className="feed-note">Headlines are aggregated from publicly indexed news publishers through GDELT. This is not a complete feed from every TV channel or newspaper; availability depends on publisher indexing. Open the publisher link for the original article.</p></section>
   <section className="section-block"><div className="section-heading"><div><span className="eyebrow">WORLDWIDE CITY REPORTS</span><h2>Live weather across the world</h2></div><span className="updated-label">LAST CHECKED · {updated?stamp(updated):"LOADING"} · LOCAL</span></div><div className="city-grid">{cities.map(c=><article className="city-card" key={c.name}><div className="city-top"><div><small>{c.region}</small><h3>{c.name}</h3></div><span className="weather-icon">{icon(c.current?.weather_code)}</span></div>{c.loading?<div className="city-loading">Loading report…</div>:c.error?<div className="city-loading">Report temporarily unavailable</div>:<><div className="city-temp">{Math.round(c.current?.temperature_2m??0)}<sup>°C</sup></div><div className="city-condition">{weatherLabel(c.current?.weather_code)}</div><div className="city-stats"><span>Humidity <b>{c.current?.relative_humidity_2m??"—"}%</b></span><span>Wind <b>{c.current?.wind_speed_10m??"—"} km/h</b></span><span>Cloud <b>{c.current?.cloud_cover??"—"}%</b></span></div><div className="city-observed">Model time: {c.current?.time?new Date(c.current.time+"Z").toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"})+" UTC":"—"}</div></>}</article>)}</div></section>
   <section className="section-block"><div><div className="section-heading"><div><span className="eyebrow">SEVERE WEATHER WATCH</span><h2>Storm & event reports</h2></div><span className="source-tag">NASA EONET</span></div>{storms.length?storms.slice(0,8).map(s=><article className="event-row" key={s.id}><div className="event-mark">!</div><div><h3>{s.title}</h3><p>{s.description||"A severe-weather event is listed in the NASA EONET event catalogue."}</p><small>EVENT CATALOGUE · {s.coordinates?.length||0} mapped positions</small></div>{s.link&&<a href={s.link} target="_blank" rel="noreferrer">Source ↗</a>}</article>):<div className="empty-report">No active severe-storm event entries were returned by the current event feed. This does not mean there is no severe weather.</div>}</div>
    
   </section>
  </main>
  <footer className="news-footer"><div className="footer-brand">EARTH WEATHER <span>GLOBAL WEATHER NEWSROOM</span></div><div>Weather reporting only · No general political or entertainment news</div><div>Weather models: Open-Meteo · Events: NASA EONET · Headlines: GDELT publisher index</div></footer>
 </div>;
}
