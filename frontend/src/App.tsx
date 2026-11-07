import { useEffect, useMemo, useState } from "react";
import { auth, firebaseReady, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";

const API=import.meta.env.VITE_API_BASE_URL||"https://earthweather-api.onrender.com";
type Current={temperature_2m?:number;relative_humidity_2m?:number;apparent_temperature?:number;precipitation?:number;cloud_cover?:number;pressure_msl?:number;wind_speed_10m?:number;wind_direction_10m?:number;weather_code?:number};
type Place={name:string;region:string;lat:number;lon:number;current?:Current;loading?:boolean;error?:boolean};
type Storm={id:string;title:string;description?:string;link?:string;coordinates?:{lat:number;lon:number;date?:string}[]};
type Source={id:string;name:string;kind:string;coverage:string;status:string;update:string;note:string};
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
const stamp=(s?:string)=>s?new Date(s).toLocaleString():"—";
export default function App(){
 const [cities,setCities]=useState<Place[]>(CITIES.map(x=>({...x,loading:true})));
 const [storms,setStorms]=useState<Storm[]>([]);const [sources,setSources]=useState<Source[]>([]);
 const [updated,setUpdated]=useState("");const [busy,setBusy]=useState(false);const [query,setQuery]=useState("");
 const [searchResult,setSearchResult]=useState<Place|null>(null);const [section,setSection]=useState("Top Stories");
 const [user,setUser]=useState<User|null>(null);const [notice,setNotice]=useState("");
 const [local,setLocal]=useState<Place|null>(null);
 useEffect(()=>{if(!auth||!firebaseReady)return;return onAuthStateChanged(auth,setUser)},[]);
 const refresh=async()=>{
  setBusy(true);
  const rows=await Promise.all(CITIES.map(async p=>{try{const r=await fetch(`${API}/api/weather?latitude=${p.lat}&longitude=${p.lon}`);if(!r.ok)throw new Error();const d=await r.json();return {...p,current:d.current||{},loading:false}}catch{return {...p,loading:false,error:true}}}));
  setCities(rows);setUpdated(new Date().toISOString());
  try{const [s,c]=await Promise.all([fetch(`${API}/api/sources`),fetch(`${API}/api/cyclones`)]);if(s.ok)setSources(await s.json());if(c.ok){const d=await c.json();setStorms(d.events||[]);}}catch{setNotice("Some weather feeds are temporarily unavailable.");}
  setBusy(false);
 };
 useEffect(()=>{void refresh();const id=window.setInterval(()=>void refresh(),10*60*1000);return()=>window.clearInterval(id)},[]);
 const active=cities.filter(c=>c.current);
 const hottest=useMemo(()=>[...active].sort((a,b)=>(b.current?.temperature_2m??-100)-(a.current?.temperature_2m??-100))[0],[active]);
 const search=async()=>{if(!query.trim())return;try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,{headers:{"Accept-Language":"en"}});const d=await r.json();if(!d.length)throw new Error("No matching place found");const p={name:d[0].name||query,region:d[0].display_name,lat:Number(d[0].lat),lon:Number(d[0].lon)};const w=await fetch(`${API}/api/weather?latitude=${p.lat}&longitude=${p.lon}`);if(!w.ok)throw new Error("Weather feed unavailable");const wd=await w.json();setSearchResult({...p,current:wd.current});setNotice("");}catch(e){setNotice(e instanceof Error?e.message:"Search failed.");}};
 const useMyLocation=()=>navigator.geolocation?.getCurrentPosition(async p=>{const lat=p.coords.latitude,lon=p.coords.longitude;try{const r=await fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`);const d=await r.json();setLocal({name:"Your location",region:"Current position",lat,lon,current:d.current});}catch{setNotice("Could not load local weather.")}},()=>setNotice("Location permission was not granted."));
 const signIn=async()=>{if(!auth)return;try{await signInWithPopup(auth,googleProvider)}catch{setNotice("Google sign-in could not be completed.")}};
 return <div className="news-site">
  <div className="breaking-strip"><div className="breaking-label">WEATHER BULLETIN</div><div className="ticker"><span>GLOBAL WEATHER DESK</span><i>•</i><span>LIVE MODEL UPDATES</span><i>•</i><span>OFFICIAL SOURCES & WEATHER OBSERVATIONS</span><i>•</i><span>WORLDWIDE FORECAST COVERAGE</span></div><div className="utc-clock">{new Date().toUTCString().slice(17,25)} UTC</div></div>
  <header className="masthead"><div className="brand-lockup"><div className="brand-symbol">E<span>W</span></div><div><div className="brand-name">EARTH WEATHER</div><div className="brand-tag">THE WORLD WEATHER NEWSROOM</div></div></div><div className="masthead-center"><span className="on-air"><b/> LIVE WEATHER DESK</span><small>Global reports · Forecasts · Storm monitoring</small></div><div className="masthead-actions"><button onClick={useMyLocation}>◎ My weather</button>{user?<button onClick={()=>void signOut(auth!)}>{user.displayName||"Account"}</button>:<button onClick={()=>void signIn()}>Sign in</button>}</div></header>
  <nav className="news-nav">{["Top Stories","World","Asia","India","Americas","Europe","Africa","Oceania","Satellite","Forecast"].map(x=><button className={section===x?"active":""} key={x} onClick={()=>setSection(x)}>{x}</button>)}</nav>
  <main className="news-main">
   <section className="news-toolbar"><div><span className="eyebrow">GLOBAL WEATHER COVERAGE</span><h1>{section==="Top Stories"?"Weather around the world":section+" weather desk"}</h1><p>Weather reports, atmospheric conditions and severe-weather event updates.</p></div><div className="search-weather"><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&void search()} placeholder="Search city or region"/><button onClick={()=>void search()}>Search</button></div></section>
   {(searchResult||local)&&<section className="search-result"><div><small>SELECTED LOCATION</small><h2>{(searchResult||local)!.name}</h2><p>{(searchResult||local)!.region}</p></div><strong>{Math.round((searchResult||local)!.current?.temperature_2m??0)}°C</strong><span>{weatherLabel((searchResult||local)!.current?.weather_code)}</span><button onClick={()=>{setSearchResult(null);setLocal(null)}}>×</button></section>}
   {notice&&<div className="notice">{notice}</div>}
   <section className="lead-grid">
    <article className="lead-story"><div className="lead-image"><div className="globe-art">◉</div><div className="image-caption">WORLD WEATHER MONITOR</div></div><div className="lead-copy"><span className="story-category">GLOBAL OVERVIEW · LIVE MODEL</span><h2>Tracking the atmosphere, across every region.</h2><p>Explore current temperature, wind, humidity, cloud cover and precipitation from global forecast models. Select a city below for its latest available report.</p><div className="story-meta">DATA DESK <span>Updated {stamp(updated)}</span></div></div></article>
    <aside className="top-brief"><div className="section-heading"><h2>Weather briefing</h2><span>GLOBAL</span></div>{hottest&&<div className="brief-highlight"><small>WARMEST IN THIS CITY WATCHLIST</small><b>{hottest.name}</b><strong>{Math.round(hottest.current?.temperature_2m??0)}°C</strong><span>{weatherLabel(hottest.current?.weather_code)}</span></div>}<div className="brief-line"><span>Active severe-storm events</span><b>{storms.length}</b></div><div className="brief-line"><span>Reporting locations</span><b>{active.length}/{cities.length}</b></div><div className="brief-line"><span>Feed refresh</span><b>{busy?"Updating":"10 min"}</b></div><button className="refresh-button" onClick={()=>void refresh()} disabled={busy}>{busy?"Refreshing…":"↻ Refresh reports"}</button></aside>
   </section>
   <section className="section-block"><div className="section-heading"><div><span className="eyebrow">WORLDWIDE CITY REPORTS</span><h2>Weather across the world</h2></div><span className="updated-label">MODEL DATA · {updated?stamp(updated):"LOADING"}</span></div><div className="city-grid">{cities.map(c=><article className="city-card" key={c.name}><div className="city-top"><div><small>{c.region}</small><h3>{c.name}</h3></div><span className="weather-icon">{icon(c.current?.weather_code)}</span></div>{c.loading?<div className="city-loading">Loading report…</div>:c.error?<div className="city-loading">Report temporarily unavailable</div>:<><div className="city-temp">{Math.round(c.current?.temperature_2m??0)}<sup>°C</sup></div><div className="city-condition">{weatherLabel(c.current?.weather_code)}</div><div className="city-stats"><span>Humidity <b>{c.current?.relative_humidity_2m??"—"}%</b></span><span>Wind <b>{c.current?.wind_speed_10m??"—"} km/h</b></span><span>Cloud <b>{c.current?.cloud_cover??"—"}%</b></span></div></>}</article>)}</div></section>
   <section className="section-block lower-grid"><div><div className="section-heading"><div><span className="eyebrow">SEVERE WEATHER WATCH</span><h2>Storm & event reports</h2></div><span className="source-tag">NASA EONET</span></div>{storms.length?storms.slice(0,8).map(s=><article className="event-row" key={s.id}><div className="event-mark">!</div><div><h3>{s.title}</h3><p>{s.description||"A severe-weather event is listed in the NASA EONET event catalogue."}</p><small>EVENT CATALOGUE · {s.coordinates?.length||0} mapped positions</small></div>{s.link&&<a href={s.link} target="_blank" rel="noreferrer">Source ↗</a>}</article>):<div className="empty-report">No active severe-storm event entries were returned by the current event feed. This does not mean there is no severe weather.</div>}</div>
    <aside className="source-panel"><div className="section-heading"><div><span className="eyebrow">TRANSPARENCY</span><h2>Weather data sources</h2></div></div>{sources.map(s=><div className="source-row" key={s.id}><div><b>{s.name}</b><small>{s.kind} · {s.coverage}</small></div><span className={"source-status "+s.status}>{s.status}</span></div>)}<p className="source-disclaimer">Reports are sourced from the providers listed. Forecast-model output, satellite imagery and official warnings are different data types. Availability and update intervals vary by provider and region.</p></aside>
   </section>
  </main>
  <footer className="news-footer"><div className="footer-brand">EARTH WEATHER <span>GLOBAL WEATHER NEWSROOM</span></div><div>Weather reporting only · No general political or entertainment news</div><div>Sources: Open-Meteo · NASA EONET · NASA GIBS · Provider feeds</div></footer>
 </div>;
}
