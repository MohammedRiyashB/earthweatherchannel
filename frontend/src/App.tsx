import { useEffect, useMemo, useRef, useState } from "react";
import { auth, firebaseReady, googleProvider } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";

const API=import.meta.env.VITE_API_BASE_URL||"https://earth-weather-api.onrender.com";
type Current={time?:string;temperature_2m?:number;relative_humidity_2m?:number;apparent_temperature?:number;precipitation?:number;cloud_cover?:number;pressure_msl?:number;wind_speed_10m?:number;wind_direction_10m?:number;weather_code?:number};
type Place={name:string;region:string;lat:number;lon:number;country?:string;country_code?:string;accuracy?:number;source?: "gps"|"search";current?:Current;loading?:boolean;error?:boolean};
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
function writeCache<T>(key:string,va
…[1 chars truncated — re-run with head/grep/tail for full output]…
ap(c=><article className={`city-card weather-scene ${weatherScene(c.current?.weather_code,c.current?.cloud_cover)}`} key={c.name}><span className="weather-sky-art" aria-hidden="true"><i/><i/><i/></span><div className="city-top"><div><small>{c.region}</small><h3>{c.name}</h3></div><span className="weather-icon">{icon(c.current?.weather_code)}</span></div>{c.loading?<div className="city-loading">Loading report…</div>:c.error?<div className="city-loading">Report temporarily unavailable</div>:<><div className="city-temp">{Math.round(c.current?.temperature_2m??0)}<sup>°C</sup></div><div className="city-condition">{weatherLabel(c.current?.weather_code)}</div><div className="city-stats"><span>Humidity <b>{c.current?.relative_humidity_2m??"—"}%</b></span><span>Wind <b>{c.current?.wind_speed_10m??"—"} km/h</b></span><span>Cloud <b>{c.current?.cloud_cover??"—"}%</b></span></div><div className="city-observed">Model time: {modelTime(c.current?.time)}</div></>}</article>);
 const search=async()=>{if(!query.trim())return;const requestVersion=++locationRequestVersion.current;try{const r=await fetchBounded(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,{headers:{"Accept-Language":"en"}},10000);const d=await r.json();if(requestVersion!==locationRequestVersion.current)return;if(!d.length)throw new Error("No matching place found");const p={name:d[0].name||query,region:d[0].display_name,source:"search" as const,country:d[0].display_name.split(",").map((part:string)=>part.trim()).filter(Boolean).pop(),lat:Number(d[0].lat),lon:Number(d[0].lon)};const w=await fetchBounded(`${API}/api/weather?latitude=${p.lat}&longitude=${p.lon}`,{},14000);if(requestVersion!==locationRequestVersion.current)return;if(!w.ok)throw new Error("Weather feed unavailable");const wd=await w.json();if(requestVersion!==locationRequestVersion.current)return;setLocal({...p,current:wd.current||{}});writeCache("local",{...p,current:wd.current||{}});setIsSearchLocation(true);setLocationStatus("ready");setLocationMessage("");setNotice("");}catch(e){if(requestVersion!==locationRequestVersion.current)return;setNotice(e instanceof Error?e.message:"Search failed.");}};
 const signIn=async()=>{if(!auth)return;try{await signInWithPopup(auth,googleProvider)}catch{setNotice("Google sign-in could not be completed.")}};
 return <div className="news-site">
  <div className="breaking-strip"><div className="breaking-label">WEATHER BULLETIN</div><div className="ticker"><span>GLOBAL WEATHER DESK</span><i>•</i><span>LIVE MODEL UPDATES</span><i>•</i><span>INDIA & WORLD WEATHER HEADLINES</span><i>•</i><span>WEATHER CHECK EVERY 60 SECONDS</span></div><div className="utc-clock">{clock.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})} LOCAL</div></div>
  <header className="masthead"><div className="brand-lockup"><img className="brand-wordmark" src="/logo.png" alt="EARTH WEATHER" width="1200" height="220" /></div><div className="masthead-center"><span className="on-air"><b/> LIVE WEATHER DESK</span><small>Global reports · Forecasts · Weather headlines</small></div><div className="masthead-actions">{user?<button onClick={()=>void signOut(auth!)}>{user.displayName||"Account"}</button>:<button onClick={()=>void signIn()}>Sign in</button>}</div></header>
  <nav className="news-nav">{["Weather Report","World","Asia","India","Americas","Europe","Africa","Oceania","Satellite","Forecast"].map(x=><button className={section===x?"active":""} key={x} onClick={()=>{setSection(x);if(x==="India"||x==="Asia")setNewsRegion("india");else if(x!=="Weather Report")setNewsRegion("world")}}>{x}</button>)}</nav>
  {page==="home"?(section==="Satellite"?<SatelliteDashboard/>:<main className="news-main">
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
     {local.loading&&!local.current&&<p className="local-weather-foot">Getting current weather for this location…</p>}{local.error&&!local.current&&<p className="local-weather-foot">Weather data is temporarily unavailable. Your detected location is still shown.</p>}{locationMessage&&<p className="local-weather-foot">{locationMessage}</p>}<div className="local-weather-stats">
      <div><span>Humidity</span><strong>{local.current?.relative_humidity_2m!=null?local.current.relative_humidity_2m+"%":"—"}</strong></div>
      <div><span>Wind</span><strong>{local.current?.wind_speed_10m!=null?local.current.wind_speed_10m+" km/h":"—"}</strong></div>
      <div><span>Cloud cover</span><strong>{local.current?.cloud_cover!=null?local.current.cloud_cover+"%":"—"}</strong></div>
     </div>
     <div className="local-weather-foot">Weather model time: {modelTime(local.current?.time)}{local.accuracy?` · GPS accuracy ±${local.accuracy>=1000?(local.accuracy/1000).toFixed(1)+" km":Math.round(local.accuracy)+" m"}`:""} · Place name: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
    </>:<div className="local-weather-prompt"><span>{locationMessage}</span><button onClick={detectLocalWeather} disabled={locationStatus==="locating"}>{locationStatus==="denied"?"Try location again":"Retry location"}</button></div>}
   </section>

   <section className="lead-grid">
    <aside className="top-brief"><div className="section-heading"><h2>Weather briefing</h2><span>GLOBAL</span></div>{hottest&&<div className="brief-highlight"><small>WARMEST CITY IN THIS LIST · NOT YOUR LOCATION</small><b>{hottest.name}</b><strong>{Math.round(hottest.current?.temperature_2m??0)}°C</strong><span>{weatherLabel(hottest.current?.weather_code)}</span></div>}<div className="brief-line"><span>Active severe-storm events</span><b>{storms.length}</b></div><div className="brief-line"><span>Reporting locations</span><b>{active.length}/{cities.length}</b></div><div className="brief-line"><span>Weather headlines</span><b>{indiaNews.length+worldNews.length}</b></div><div className="brief-line"><span>Auto refresh</span><b>Local 60s · Cities 5m</b></div><button className="refresh-button" onClick={()=>{if(visitorLocation)void refreshWeather(visitorLocation);else void refreshPopularCities();void refreshFeeds()}} disabled={busy}>{busy?"Refreshing…":"↻ Refresh live reports"}</button></aside>
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
  </main>)
  :<main className="news-main info-page">
   <div className="info-page-brand"><img src="/logo.png" alt="EARTH WEATHER" /></div>
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
    <img className="footer-logo" src="/logo.png" alt="EARTH WEATHER logo" />
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
