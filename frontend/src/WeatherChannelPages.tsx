import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "https://earthweather-api.onrender.com";

type WeatherLocation = {
  name: string; region: string; lat: number; lon: number;
  current?: Record<string, any>;
} | null;
type WeatherCity = { name: string; region?: string; current?: Record<string, any> };
type StormEvent = { id: string; title: string; description?: string; link?: string; coordinates?: {lat:number;lon:number;date?:string}[] };
type WeatherMode = "Weather Report" | "Hourly" | "10 Day" | "Radar" | "Air Quality" | "Allergy" | "Storm reports";
type Forecast = { current?: Record<string, any>; hourly?: Record<string, any[]>; daily?: Record<string, any[]>; source?: {name?:string;provider?:string;url?:string} };
type Radar = { host?:string; frames?: {time:number;path:string}[]; note?:string };
type Air = { current?:Record<string,any>; source?:{name?:string;resolution_km?:number}; note?:string };
type Props = {
  mode: WeatherMode; location: WeatherLocation; cities: WeatherCity[]; storms: StormEvent[];
  onNavigate: (page:string)=>void; onSearchLocation: ()=>void;
};
const fmt = (v:unknown,d=0) => typeof v==="number" && Number.isFinite(v) ? Number(v.toFixed(d)).toString() : "—";
const condition = (code:unknown) => {
  if(typeof code!=="number") return "Conditions unavailable";
  if(code===0)return "Clear"; if(code===1)return "Mainly clear"; if(code===2)return "Partly cloudy"; if(code===3)return "Overcast";
  if([45,48].includes(code))return "Fog"; if([51,53,55,56,57].includes(code))return "Drizzle";
  if([61,63,65,66,67,80,81,82].includes(code))return "Rain"; if([71,73,75,77,85,86].includes(code))return "Snow";
  if([95,96,99].includes(code))return "Thunderstorms"; return "Variable conditions";
};
const icon = (code:unknown) => {
  if(code===0)return "☀️"; if(code===1)return "🌤️"; if(code===2)return "⛅"; if(code===3)return "☁️";
  if(typeof code==="number"&&[45,48].includes(code))return "🌫️";
  if(typeof code==="number"&&[95,96,99].includes(code))return "⛈️";
  if(typeof code==="number"&&[71,73,75,77,85,86].includes(code))return "❄️";
  if(typeof code==="number"&&[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return "🌧️";
  return "🌡️";
};
const clock = (v:unknown) => {
  if(typeof v!=="string"||!v)return "—";
  const d=new Date(v); return Number.isNaN(d.getTime())?v:d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
};
const day = (v:unknown) => {
  if(typeof v!=="string"||!v)return "—";
  const d=new Date(v.length===10?v+"T12:00:00":v);
  return Number.isNaN(d.getTime())?v:d.toLocaleDateString([],{weekday:"short",day:"numeric",month:"short"});
};
const aqiLabel=(n:number)=>n<=50?"Good":n<=100?"Moderate":n<=150?"Unhealthy for sensitive groups":n<=200?"Unhealthy":n<=300?"Very unhealthy":"Hazardous";
const aqiClass=(n:number)=>n<=50?"good":n<=100?"moderate":n<=150?"sensitive":n<=200?"unhealthy":n<=300?"very-unhealthy":"hazardous";

export function WeatherChannelSidebar({active,onNavigate}:{active:string;onNavigate:(page:string)=>void}) {
  const groups=[
    {title:"Weather",items:[["Weather Report","Today","☀"],["Hourly","Hourly","◷"],["10 Day","10 day","▤"],["Radar","Radar","◉"]]},
    {title:"Health",items:[["Air Quality","Air quality","◌"],["Allergy","Allergy","✳"]]},
    {title:"Explore",items:[["Satellite imagery","Satellite","◎"],["Storm reports","Storms","⚡"],["Satellite Report","Satellite report","⌁"]]},
    {title:"News",items:[["World","World","◈"],["Country","Country","⌖"],["State","State","⌖"],["Local","Local","⌖"]]}
  ] as const;
  return <aside className="wc-sidebar" aria-label="Weather navigation">{groups.map(group=><section className="wc-sidebar-group" key={group.title}>
    <span className="wc-sidebar-heading">{group.title}</span>
    {group.items.map(([key,label,glyph])=><button key={key} type="button" className={active===key?"active":""} onClick={()=>onNavigate(key)} aria-current={active===key?"page":undefined}>
      <span className="wc-side-icon">{glyph}</span><span className="wc-side-label">{label}</span>
    </button>)}
  </section>)}</aside>;
}

function ForecastHeader({location,mode,onNavigate,onSearchLocation}:{location:WeatherLocation;mode:WeatherMode;onNavigate:(page:string)=>void;onSearchLocation:()=>void}) {
  return <>
    <div className="wc-breadcrumb"><span>Weather</span><b>›</b><span>{location?.region||"Your location"}</span><b>›</b><strong>{location?.name||"Local forecast"}</strong></div>
    <div className="wc-page-heading"><div><span className="wc-eyebrow">EARTH WEATHER FORECAST</span><h1>{location?.name?location.name+" Weather":"Weather Forecast"}</h1><p>{location?.region||"Choose a location to view local weather conditions and forecasts."}</p></div><button className="wc-location-button" type="button" onClick={onSearchLocation}>⌖ <span>Change location</span></button></div>
    <nav className="wc-local-tabs" aria-label="Local weather pages">
      <button className={mode==="Weather Report"?"active":""} onClick={()=>onNavigate("Weather Report")}>Today</button>
      <button className={mode==="Hourly"?"active":""} onClick={()=>onNavigate("Hourly")}>Hourly</button>
      <button className={mode==="10 Day"?"active":""} onClick={()=>onNavigate("10 Day")}>10 day</button>
    </nav>
  </>;
}

export function WeatherChannelPage({mode,location,cities,storms,onNavigate,onSearchLocation}:Props) {
  const [forecast,setForecast]=useState<Forecast|null>(null);
  const [forecastError,setForecastError]=useState("");
  const [forecastLoading,setForecastLoading]=useState(false);
  const [radar,setRadar]=useState<Radar|null>(null);
  const [radarError,setRadarError]=useState("");
  const [radarLoading,setRadarLoading]=useState(false);
  const [frameIndex,setFrameIndex]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [zoom,setZoom]=useState(5);
  const [air,setAir]=useState<Air|null>(null);
  const [airError,setAirError]=useState("");
  const [airLoading,setAirLoading]=useState(false);
  const [reload,setReload]=useState(0);

  useEffect(()=>{
    if(!location){setForecast(null);setForecastError("Select a location or allow browser location access.");return;}
    const controller=new AbortController();setForecastLoading(true);setForecastError("");
    const q=new URLSearchParams({latitude:String(location.lat),longitude:String(location.lon),days:"10",timezone:"auto"});
    fetch(API+"/api/forecast?"+q.toString(),{cache:"no-store",signal:controller.signal})
      .then(async r=>{if(!r.ok){const body=await r.json().catch(()=>({}));throw new Error(body?.detail?.message||body?.detail||"Forecast unavailable");}return r.json() as Promise<Forecast>;})
      .then(setForecast)
      .catch(e=>{if(!controller.signal.aborted)setForecastError(e instanceof Error?e.message:"Forecast unavailable");})
      .finally(()=>{if(!controller.signal.aborted)setForecastLoading(false);});
    return()=>controller.abort();
  },[location?.lat,location?.lon,reload]);

  useEffect(()=>{
    if(mode!=="Radar")return;
    let active=true;
    const load=async()=>{setRadarLoading(true);try{const r=await fetch(API+"/api/radar",{cache:"no-store"});if(!r.ok)throw new Error("Radar service unavailable");const data=await r.json() as Radar;if(active){setRadar(data);setFrameIndex(Math.max(0,(data.frames?.length||1)-1));setRadarError("");}}catch(e){if(active)setRadarError(e instanceof Error?e.message:"Radar unavailable");}finally{if(active)setRadarLoading(false);}};
    void load();const timer=window.setInterval(()=>void load(),10*60*1000);return()=>{active=false;window.clearInterval(timer);};
  },[mode,reload]);

  useEffect(()=>{
    if(mode!=="Air Quality"||!location)return;
    const controller=new AbortController();setAirLoading(true);setAirError("");
    const q=new URLSearchParams({latitude:String(location.lat),longitude:String(location.lon),days:"5"});
    fetch(API+"/api/air-quality?"+q.toString(),{cache:"no-store",signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error("Air-quality model is temporarily unavailable");return r.json() as Promise<Air>;})
      .then(setAir).catch(e=>{if(!controller.signal.aborted)setAirError(e instanceof Error?e.message:"Air-quality data unavailable");})
      .finally(()=>{if(!controller.signal.aborted)setAirLoading(false);});
    return()=>controller.abort();
  },[mode,location?.lat,location?.lon,reload]);

  const hourly=forecast?.hourly||{};
  const daily=forecast?.daily||{};
  const current=location?.current||forecast?.current||{};
  const hours=(hourly.time||[]).slice(0,24);
  const days=(daily.time||[]).slice(0,10);
  const temps=(hourly.temperature_2m||[]).slice(0,24).filter(v=>typeof v==="number"&&Number.isFinite(v)) as number[];
  const tempLine=useMemo(()=>{
    if(temps.length<2)return "";
    const low=Math.min(...temps),high=Math.max(...temps),span=Math.max(1,high-low);
    return temps.map((v,i)=>(28+i*664/(temps.length-1))+","+(124-((v-low)/span)*88)).join(" ");
  },[forecast]);
  const radarFrames=radar?.frames||[];
  const frame=radarFrames[frameIndex]||radarFrames[radarFrames.length-1];
  useEffect(()=>{if(!playing||radarFrames.length<2)return;const timer=window.setInterval(()=>setFrameIndex(i=>(i+1)%radarFrames.length),1100);return()=>window.clearInterval(timer);},[playing,radarFrames.length]);
  const tiles=useMemo(()=>{
    if(!location)return [];
    const n=2**zoom;const lat=Math.max(-85.0511,Math.min(85.0511,location.lat))*Math.PI/180;
    const cx=Math.floor((location.lon+180)/360*n);const cy=Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*n);
    const out:{x:number;y:number;key:string}[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=((cx+dx)%n+n)%n;const y=cy+dy;if(y>=0&&y<n)out.push({x,y,key:zoom+"-"+x+"-"+y});}
    return out;
  },[location?.lat,location?.lon,zoom]);
  const provider=forecast?.source?.name||forecast?.source?.provider||"Configured forecast provider";
  const renderHours=(limit:number)=>hours.slice(0,limit).map((t,i)=><article className="wc-hour-item" key={String(t)+i}>
    <span>{i===0?"Now":clock(t)}</span><b>{icon(hourly.weather_code?.[i])}</b><strong>{fmt(hourly.temperature_2m?.[i])}°</strong>
    <small>{hourly.precipitation_probability?.[i]!=null?fmt(hourly.precipitation_probability[i])+"% rain":"Rain —"}</small>
    <small>{hourly.wind_speed_10m?.[i]!=null?fmt(hourly.wind_speed_10m[i],1)+" km/h":"Wind —"}</small>
  </article>);
  const renderDays=(limit:number)=>days.slice(0,limit).map((t,i)=><article className="wc-daily-row" key={String(t)+i}>
    <strong>{i===0?"Today":day(t)}</strong><b>{icon(daily.weather_code?.[i])}</b><span>{condition(daily.weather_code?.[i])}</span>
    <small>Rain {daily.precipitation_sum?.[i]!=null?fmt(daily.precipitation_sum[i],1)+" mm":"—"}</small>
    <small>Wind {daily.wind_speed_10m_max?.[i]!=null?fmt(daily.wind_speed_10m_max[i],1)+" km/h":"—"}</small>
    <strong className="wc-temperatures">{fmt(daily.temperature_2m_max?.[i])}° <i>/</i> {fmt(daily.temperature_2m_min?.[i])}°</strong>
  </article>);
  const loadingForecast=forecastLoading&&!forecast;
  return <main className="wc-page">
    <ForecastHeader location={location} mode={mode} onNavigate={onNavigate} onSearchLocation={onSearchLocation}/>
    {mode==="Weather Report"&&<>
      <div className="wc-weather-overview">
        <section className="wc-current-card">
          <div className="wc-current-top"><span>CURRENT CONDITIONS</span><span>{clock(current.time)}</span></div>
          <div className="wc-current-location">{location?.name||"Choose your location"}</div>
          <div className="wc-current-summary"><div className="wc-current-icon">{icon(current.weather_code)}</div><div><strong>{fmt(current.temperature_2m)}°</strong><span>{condition(current.weather_code)}</span></div></div>
          <div className="wc-high-low"><span>H: {fmt(daily.temperature_2m_max?.[0])}°</span><span>L: {fmt(daily.temperature_2m_min?.[0])}°</span><i>·</i><span>Feels like {fmt(current.apparent_temperature)}°</span></div>
          <div className="wc-current-detail-strip">
            <span><b>{fmt(current.wind_speed_10m,1)} km/h</b><small>Wind</small></span><span><b>{fmt(current.relative_humidity_2m)}%</b><small>Humidity</small></span><span><b>{fmt(current.precipitation,1)} mm</b><small>Rain</small></span>
          </div>
        </section>
        <section className="wc-details-card"><div className="wc-card-heading"><h2>Weather details</h2><span>Current conditions</span></div><div className="wc-details-grid">
          <div><span>Feels like</span><strong>{fmt(current.apparent_temperature)}°</strong><small>Perceived temperature</small></div>
          <div><span>Wind</span><strong>{fmt(current.wind_speed_10m,1)} km/h</strong><small>10 m height</small></div>
          <div><span>Humidity</span><strong>{fmt(current.relative_humidity_2m)}%</strong><small>Relative humidity</small></div>
          <div><span>Cloud cover</span><strong>{fmt(current.cloud_cover)}%</strong><small>Model estimate</small></div>
          <div><span>Pressure</span><strong>{fmt(current.pressure_msl)} hPa</strong><small>Mean sea level</small></div>
          <div><span>Rainfall</span><strong>{fmt(current.precipitation,1)} mm</strong><small>Provider period</small></div>
        </div></section>
      </div>
      <section className="wc-content-card"><div className="wc-card-heading"><div><span className="wc-eyebrow">PLAN YOUR DAY</span><h2>Today's weather</h2></div><button onClick={()=>onNavigate("Hourly")}>Hourly forecast ›</button></div>
        {loadingForecast&&<div className="wc-loading">Loading forecast…</div>}{forecastError&&!forecast&&<div className="wc-loading">{forecastError}</div>}
        {forecast&&<div className="wc-hourly-strip">{renderHours(12)}</div>}
      </section>
      <section className="wc-content-card"><div className="wc-card-heading"><div><span className="wc-eyebrow">EXTENDED OUTLOOK</span><h2>10-day forecast</h2></div><button onClick={()=>onNavigate("10 Day")}>Full forecast ›</button></div>
        {forecast&&<div className="wc-daily-list">{renderDays(5)}</div>}{loadingForecast&&<div className="wc-loading">Loading daily outlook…</div>}
      </section>
      <section className="wc-link-grid">
        <button className="wc-feature-link" onClick={()=>onNavigate("Radar")}><span className="wc-feature-icon">◉</span><span><strong>Interactive radar</strong><small>Recent radar frames and rainfall</small></span><b>›</b></button>
        <button className="wc-feature-link" onClick={()=>onNavigate("Air Quality")}><span className="wc-feature-icon">◌</span><span><strong>Air quality</strong><small>Modelled pollutants and AQI</small></span><b>›</b></button>
        <button className="wc-feature-link" onClick={()=>onNavigate("Satellite imagery")}><span className="wc-feature-icon">◎</span><span><strong>Satellite imagery</strong><small>Explore Earth observation layers</small></span><b>›</b></button>
      </section>
      <section className="wc-content-card"><div className="wc-card-heading"><div><span className="wc-eyebrow">NEARBY AND WORLD CITIES</span><h2>Weather around the world</h2></div></div>
        {cities.length>0?<div className="wc-city-grid">{cities.slice(0,8).map((c,i)=><article className="wc-city-card" key={c.name+i}><span>{c.name}</span><b>{fmt(c.current?.temperature_2m)}°</b><small>{condition(c.current?.weather_code)}</small></article>)}</div>:<div className="wc-loading">City reports are being updated.</div>}
      </section>
      <section className="wc-content-card"><div className="wc-card-heading"><div><span className="wc-eyebrow">SEVERE WEATHER</span><h2>Storm & event reports</h2></div><button onClick={()=>onNavigate("Storm reports")}>View all ›</button></div>
        {storms.length>0?<div className="wc-storm-grid">{storms.slice(0,3).map(s=><article className="wc-storm-item" key={s.id}><span className="wc-storm-mark">!</span><div><strong>{s.title}</strong><p>{s.description||"Curated event entry from NASA EONET."}</p>{s.link&&<a href={s.link} target="_blank" rel="noreferrer">Event source ↗</a>}</div></article>)}</div>:<div className="wc-loading">No open event entries returned by NASA EONET.</div>}
      </section><p className="wc-data-note">Weather values are numerical model guidance from {provider}. They are not automatically direct local-station observations. Provider coverage and update times vary.</p>
    </>}
    {mode==="Hourly"&&<section className="wc-content-card wc-page-section">
      <div className="wc-card-heading"><div><span className="wc-eyebrow">HOUR-BY-HOUR</span><h2>Hourly weather forecast</h2><p>Temperature, conditions, precipitation and wind over the next 24 hours.</p></div><button onClick={()=>setReload(v=>v+1)} disabled={forecastLoading}>↻ Refresh</button></div>
      {loadingForecast&&<div className="wc-loading">Loading hourly forecast…</div>}{forecastError&&!forecast&&<div className="wc-loading">{forecastError}</div>}
      {forecast&&<><div className="wc-hour-chart"><div><strong>Temperature trend</strong><span>°C · next 24 hours</span></div><svg viewBox="0 0 720 160" role="img" aria-label="Hourly temperature trend">{[35,75,115].map(y=><line key={y} x1="20" x2="700" y1={y} y2={y} stroke="#e8edf0" strokeDasharray="4 5"/>)}{tempLine&&<polyline points={tempLine} fill="none" stroke="#147fa8" strokeWidth="4" strokeLinecap="round"/>}</svg></div><div className="wc-hourly-table">{hours.map((t,i)=><div className="wc-hourly-row" key={String(t)+i}><strong>{i===0?"Now":clock(t)}</strong><b>{icon(hourly.weather_code?.[i])}</b><span>{condition(hourly.weather_code?.[i])}</span><strong>{fmt(hourly.temperature_2m?.[i])}°</strong><small>Feels {fmt(hourly.apparent_temperature?.[i])}°</small><small>Rain {hourly.precipitation_probability?.[i]!=null?fmt(hourly.precipitation_probability[i])+"%":"—"}</small><small>Wind {fmt(hourly.wind_speed_10m?.[i],1)} km/h</small></div>)}</div></>}
      <p className="wc-data-note">Provider: {provider}. Missing precipitation probabilities remain blank when unavailable.</p>
    </section>}
    {mode==="10 Day"&&<section className="wc-content-card wc-page-section"><div className="wc-card-heading"><div><span className="wc-eyebrow">EXTENDED FORECAST</span><h2>10-day weather forecast</h2><p>Daily high and low temperatures, conditions, rain and wind.</p></div><button onClick={()=>setReload(v=>v+1)} disabled={forecastLoading}>↻ Refresh</button></div>
      {loadingForecast&&<div className="wc-loading">Loading 10-day forecast…</div>}{forecastError&&!forecast&&<div className="wc-loading">{forecastError}</div>}
      {forecast&&<><div className="wc-daily-list wc-daily-full">{renderDays(10)}</div>{days.length<10&&<p className="wc-data-note">The selected provider returned {days.length} forecast days. No extra days are invented.</p>}</>}
    </section>}
    {mode==="Radar"&&<section className="wc-content-card wc-page-section"><div className="wc-card-heading"><div><span className="wc-eyebrow">PRECIPITATION MAP</span><h2>Interactive weather radar</h2><p>{location?.name||"Selected location"} · Recent radar frames where coverage is available.</p></div><button onClick={()=>setReload(v=>v+1)} disabled={radarLoading}>↻ Update</button></div>
      {radarLoading&&!radar&&<div className="wc-loading">Connecting to radar data…</div>}{radarError&&!radar&&<div className="wc-loading">{radarError}</div>}
      {radar&&frame&&location&&<div className="wc-radar-map-frame"><div className="wc-map-label"><span className="wc-radar-pulse"/> RADAR HISTORY <span>{new Date(frame.time*1000).toLocaleString()}</span></div>
        <div className="wc-map-canvas"><div className="wc-map-grid">{tiles.map(tile=><div className="wc-map-tile" key={tile.key}><img className="wc-base-tile" src={"https://tile.openstreetmap.org/"+zoom+"/"+tile.x+"/"+tile.y+".png"} alt="" loading="lazy"/><img className="wc-radar-tile" src={(radar.host||"")+frame.path+"/256/"+zoom+"/"+tile.x+"/"+tile.y+"/2/1_1.png"} alt="" loading="lazy"/></div>)}</div><div className="wc-map-location-label">⌖ {location.name}</div></div>
        <div className="wc-radar-controls"><button onClick={()=>setPlaying(v=>!v)}>{playing?"Ⅱ Pause":"▶ Play"}</button><input type="range" min="0" max={Math.max(0,radarFrames.length-1)} value={Math.max(0,frameIndex)} onChange={e=>{setPlaying(false);setFrameIndex(Number(e.target.value));}} aria-label="Radar timeline"/><span>{frameIndex+1}/{radarFrames.length}</span><button onClick={()=>setZoom(v=>Math.min(7,v+1))} disabled={zoom>=7}>+</button><button onClick={()=>setZoom(v=>Math.max(3,v-1))} disabled={zoom<=3}>−</button></div>
        <div className="wc-radar-foot"><span>Radar by <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a></span><span>Map © OpenStreetMap contributors</span></div><p className="wc-data-note">{radar.note||"Past radar frames only; coverage is incomplete and is not a nowcast."}</p>
      </div>}
      {!location&&<div className="wc-loading">Choose a location to centre the radar map.</div>}
    </section>}
    {mode==="Air Quality"&&<section className="wc-content-card wc-page-section"><div className="wc-card-heading"><div><span className="wc-eyebrow">AIR QUALITY FORECAST</span><h2>Air quality in {location?.name||"your area"}</h2><p>Modelled pollutant concentrations for your location.</p></div><button onClick={()=>setReload(v=>v+1)} disabled={airLoading}>↻ Refresh</button></div>
      {airLoading&&!air&&<div className="wc-loading">Loading air-quality data…</div>}{airError&&!air&&<div className="wc-loading">{airError}</div>}
      {air?.current&&<>{typeof air.current.us_aqi==="number"&&<div className={"wc-aqi-hero "+aqiClass(air.current.us_aqi)}><div><span>US AQI REFERENCE SCALE</span><strong>{Math.round(air.current.us_aqi)}</strong><b>{aqiLabel(air.current.us_aqi)}</b></div><small>Model guidance · not an official Indian CPCB station reading</small></div>}
        <div className="wc-pollutant-grid">{[["PM2.5",air.current.pm2_5],["PM10",air.current.pm10],["Ozone",air.current.ozone],["Nitrogen dioxide",air.current.nitrogen_dioxide],["Sulphur dioxide",air.current.sulphur_dioxide],["Carbon monoxide",air.current.carbon_monoxide]].map(([label,value])=><div className="wc-pollutant" key={String(label)}><span>{label}</span><strong>{fmt(value,1)}</strong><small>μg/m³</small></div>)}</div>
        <p className="wc-data-note">{air.note||"CAMS modelled guidance, not a local ground-monitor reading."} Source: {air.source?.name||"Open-Meteo CAMS"} · nominal grid {air.source?.resolution_km||45} km.</p>
      </>}
    </section>}
    {mode==="Allergy"&&<section className="wc-content-card wc-page-section"><div className="wc-card-heading"><div><span className="wc-eyebrow">POLLEN & ALLERGY</span><h2>Allergy forecast</h2><p>{location?.name||"Selected location"}</p></div></div><div className="wc-empty-data"><strong>Pollen data is not available for this region.</strong><span>The connected public pollen forecast does not provide reliable coverage for this location. No pollen level is fabricated.</span></div></section>}
    {mode==="Storm reports"&&<section className="wc-content-card wc-page-section"><div className="wc-card-heading"><div><span className="wc-eyebrow">SEVERE WEATHER EVENTS</span><h2>Storm & event reports</h2><p>Curated active event entries from NASA EONET.</p></div></div>
      {storms.length>0?<div className="wc-storm-grid">{storms.map(s=><article className="wc-storm-item" key={s.id}><span className="wc-storm-mark">!</span><div><strong>{s.title}</strong><p>{s.description||"A curated event entry from NASA EONET."}</p><small>{s.coordinates?.length||0} mapped positions</small>{s.link&&<a href={s.link} target="_blank" rel="noreferrer">Event source ↗</a>}</div></article>)}</div>:<div className="wc-loading">No open severe-storm event entries were returned by NASA EONET.</div>}<p className="wc-data-note">NASA EONET is a curated natural-event catalogue, not a complete cyclone tracker or official warning authority.</p>
    </section>}
  </main>;
}
