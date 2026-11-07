import { useCallback, useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";

type Weather = {
  latitude: number; longitude: number; timezone?: string;
  current?: { time: string; temperature_2m?: number; relative_humidity_2m?: number; apparent_temperature?: number; precipitation?: number; cloud_cover?: number; pressure_msl?: number; wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number; weather_code?: number };
  hourly?: { time: string[]; precipitation_probability?: number[]; precipitation?: number[]; temperature_2m?: number[]; wind_speed_10m?: number[] };
};
type Source = { id: string; name: string; kind: string; coverage: string; status: string; update: string; note: string };
type RadarFrame = { time: number; path: string };
type WindPoint = {lat:number;lon:number;speed_kmh:number;direction_deg:number;gust_kmh?:number;cloud_cover_pct?:number;humidity_pct?:number;precipitation_mm?:number};
type Atmosphere = {hourly?: Record<string, (string|number|null)[]>; note?:string; source?:string};
type CycloneEvent = {id:string;title:string;description?:string;link?:string;coordinates:{lat:number;lon:number;date?:string}[]};
type HealthCheck = {id:string;status:string;latency_ms?:number;http_status?:number;error?:string};
type Particle = {lat:number;lon:number;trail:Cesium.Cartesian3[];point:Cesium.Entity;line:Cesium.Entity;speed:number;direction:number};
const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const fmt = (n?: number, suffix = "") => n == null ? "—" : `${Math.round(n)}${suffix}`;
const dateUTC = (daysAgo = 1) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - daysAgo); return d.toISOString().slice(0, 10); };
const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n));
const nearestWind = (lat:number,lon:number,grid:WindPoint[]) => grid.reduce((best,p) => {
  const dx = Math.min(Math.abs(p.lon-lon),360-Math.abs(p.lon-lon))*Math.cos(lat*Math.PI/180);
  const score = Math.hypot(p.lat-lat,dx);
  return score < best.score ? {point:p,score} : best;
},{point:grid[0],score:Infinity}).point;

export default function App() {
  const globeHost = useRef<HTMLDivElement>(null);
  const viewer = useRef<Cesium.Viewer | null>(null);
  const particles = useRef<Particle[]>([]);
  const cloudEntities = useRef<Cesium.Entity[]>([]);
  const cycloneEntities = useRef<Cesium.Entity[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [atmosphere, setAtmosphere] = useState<Atmosphere | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [health, setHealth] = useState<HealthCheck[]>([]);
  const [windGrid, setWindGrid] = useState<WindPoint[]>([]);
  const [cyclones, setCyclones] = useState<CycloneEvent[]>([]);
  const [coords, setCoords] = useState<{lat:number; lon:number} | null>(null);
  const [place, setPlace] = useState("Global view");
  const [message, setMessage] = useState("Choose Allow location to load local weather.");
  const [busy, setBusy] = useState(false);
  const [layerOn, setLayerOn] = useState(true);
  const [selectedSatellite, setSelectedSatellite] = useState("VIIRS");
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarHost, setRadarHost] = useState("");
  const [radarIndex, setRadarIndex] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(1);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [windOn, setWindOn] = useState(true);
  const [cloudOn, setCloudOn] = useState(false);
  const [rainOn, setRainOn] = useState(false);
  const [panel, setPanel] = useState("overview");
  const satelliteLayer = useRef<Cesium.ImageryLayer | null>(null);

  useEffect(() => {
    if (!globeHost.current || viewer.current) return;
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) Cesium.Ion.defaultAccessToken = token;
    const v = new Cesium.Viewer(globeHost.current, {
      animation:false,timeline:false,geocoder:false,homeButton:true,sceneModePicker:false,
      navigationHelpButton:false,baseLayerPicker:false,fullscreenButton:false,infoBox:false,
      selectionIndicator:false,shouldAnimate:true,baseLayer:false,
      terrainProvider:new Cesium.EllipsoidTerrainProvider()
    });
    v.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({url:"https://tile.openstreetmap.org/"}));
    v.scene.globe.enableLighting = true;
    if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true;
    v.scene.globe.showGroundAtmosphere = true;
    v.camera.setView({destination:Cesium.Cartesian3.fromDegrees(15,18,25500000)});
    const nasa = new Cesium.UrlTemplateImageryProvider({
      url:`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${dateUTC(1)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      maximumLevel:9,credit:"NASA GIBS / VIIRS SNPP"
    });
    const layer=v.imageryLayers.addImageryProvider(nasa); layer.alpha=0.86; satelliteLayer.current=layer; viewer.current=v;
    return () => { particles.current=[];cloudEntities.current=[];cycloneEntities.current=[];v.destroy();viewer.current=null;satelliteLayer.current=null; };
  }, []);

  const loadWeather = useCallback(async (lat:number,lon:number,label:string) => {
    setBusy(true);setMessage("Loading live model fields…");
    try {
      const [w,a]=await Promise.all([
        fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`),
        fetch(`${API}/api/atmosphere?latitude=${lat}&longitude=${lon}`)
      ]);
      if(!w.ok||!a.ok) throw new Error("Weather model service unavailable");
      const [wd,ad]=await Promise.all([w.json(),a.json()]);
      setWeather(wd as Weather);setAtmosphere(ad as Atmosphere);setCoords({lat,lon});setPlace(label);setMessage("Forecast and atmospheric model fields updated.");
      viewer.current?.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(lon,lat,1900000),duration:2.2});
    } catch(e){setMessage(e instanceof Error?e.message:"Weather data unavailable.");}
    finally{setBusy(false);}
  },[]);

  const locate=useCallback(()=>{
    if(!navigator.geolocation){setMessage("Geolocation is not supported by this browser.");return;}
    setMessage("Waiting for location permission…");
    navigator.geolocation.getCurrentPosition(p=>loadWeather(p.coords.latitude,p.coords.longitude,"Your location"),
      e=>setMessage(e.code===1?"Location permission denied. Global layers remain available.":"Could not determine location. Try again."),
      {enableHighAccuracy:true,timeout:12000,maximumAge:300000});
  },[loadWeather]);
  useEffect(()=>{locate();},[locate]);

  const refreshGlobal=useCallback(async()=>{
    try{
      const [w,c,h,s]=await Promise.all([
        fetch(`${API}/api/wind-grid`),fetch(`${API}/api/cyclones`),fetch(`${API}/api/health/sources`),fetch(`${API}/api/sources`)
      ]);
      if(w.ok){const d=await w.json();setWindGrid(d.points||[]);}
      if(c.ok){const d=await c.json();setCyclones(d.events||[]);}
      if(h.ok){const d=await h.json();setHealth(d.checks||[]);}
      if(s.ok)setSources(await s.json());
    }catch{setMessage("Some global data services are temporarily unreachable.");}
  },[]);
  useEffect(()=>{refreshGlobal();const id=window.setInterval(refreshGlobal,5*60*1000);return()=>window.clearInterval(id);},[refreshGlobal]);
  useEffect(()=>{const id=window.setInterval(()=>{fetch(`${API}/api/health/sources`).then(r=>r.ok?r.json():null).then(d=>d&&setHealth(d.checks||[])).catch(()=>{});},60000);return()=>window.clearInterval(id);},[]);

  useEffect(()=>{
    if(selectedSatellite!=="Rain Radar")return;
    let active=true;
    const refresh=async()=>{try{const r=await fetch(`${API}/api/radar`);if(!r.ok)throw new Error();const d=await r.json();if(!active)return;setRadarHost(d.host||"");setRadarFrames(d.frames||[]);if(d.frames?.length)setRadarIndex(d.frames.length-1);}catch{if(active)setMessage("Rain radar temporarily unavailable.");}};
    refresh();const id=window.setInterval(refresh,5*60*1000);return()=>{active=false;window.clearInterval(id);};
  },[selectedSatellite]);

  useEffect(()=>{
    const v=viewer.current;if(!v||!satelliteLayer.current)return;
    const configs:Record<string,{url:string;credit:string;max:number}> = {
      VIIRS:{url:`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${dateUTC(historyOffset)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,credit:"NASA GIBS / VIIRS SNPP",max:9},
      "GOES East":{url:"https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt/GOES-East_ABI_GeoColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",credit:"NASA GIBS / NOAA GOES-East",max:9},
      "GOES West":{url:"https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt/GOES-West_ABI_GeoColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",credit:"NASA GIBS / NOAA GOES-West",max:9},
      "GOES East IR":{url:"https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",credit:"NASA GIBS / NOAA GOES-East IR",max:9}
    };
    let cfg=configs[selectedSatellite];
    if(selectedSatellite==="Rain Radar"){const frame=radarFrames[radarIndex];if(!radarHost||!frame)return;cfg={url:`${radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_0.png`,credit:"Weather radar © RainViewer",max:7};}
    if(!cfg)return;
    v.imageryLayers.remove(satelliteLayer.current,false);
    const next=v.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({url:cfg.url,maximumLevel:cfg.max,credit:cfg.credit}));
    next.alpha=0.9;next.show=layerOn;satelliteLayer.current=next;
  },[selectedSatellite,layerOn,radarHost,radarFrames,radarIndex,historyOffset]);

  useEffect(()=>{
    const v=viewer.current;if(!v||!windGrid.length)return;
    particles.current.forEach(p=>{v.entities.remove(p.point);v.entities.remove(p.line);});particles.current=[];
    for(let i=0;i<150;i++){
      const lat=-68+Math.random()*136,lon=-180+Math.random()*360,wind=nearestWind(lat,lon,windGrid);
      const point=v.entities.add({position:Cesium.Cartesian3.fromDegrees(lon,lat,18000),point:{pixelSize:2.4,color:Cesium.Color.fromCssColorString("#8be9ff").withAlpha(0.9),disableDepthTestDistance:Number.POSITIVE_INFINITY}});
      const line=v.entities.add({polyline:{positions:[],width:1.2,material:Cesium.Color.fromCssColorString("#65d8ee").withAlpha(0.42),arcType:Cesium.ArcType.NONE}});
      particles.current.push({lat,lon,trail:[],point,line,speed:wind.speed_kmh,direction:wind.direction_deg});
    }
  },[windGrid]);

  useEffect(()=>{
    const v=viewer.current;if(!v||!windGrid.length)return;
    let frame=0,last=performance.now(),id=0;
    const animate=(now:number)=>{
      const dt=Math.min((now-last)/1000,0.08);last=now;
      for(const p of particles.current){
        const w=nearestWind(p.lat,p.lon,windGrid);p.speed=w.speed_kmh;p.direction=w.direction_deg;
        const radians=(p.direction+180)*Math.PI/180;
        const km=p.speed*dt/3600*18;
        p.lat=clamp(p.lat+Math.cos(radians)*km/111,-72,72);
        p.lon+=Math.sin(radians)*km/(111*Math.max(0.18,Math.cos(p.lat*Math.PI/180)));
        if(p.lon>180)p.lon-=360;if(p.lon< -180)p.lon+=360;
        p.trail.push(Cesium.Cartesian3.fromDegrees(p.lon,p.lat,18000));if(p.trail.length>7)p.trail.shift();
        p.point.position=Cesium.Cartesian3.fromDegrees(p.lon,p.lat,18000);
        if(p.trail.length>1)p.line.polyline!.positions=p.trail;
      }
      frame++;id=requestAnimationFrame(animate);
    };
    id=requestAnimationFrame(animate);return()=>cancelAnimationFrame(id);
  },[windGrid]);

  useEffect(()=>{
    const v=viewer.current;if(!v)return;
    cloudEntities.current.forEach(e=>v.entities.remove(e));cloudEntities.current=[];
    if(!cloudOn||!windGrid.length)return;
    windGrid.filter(p=>(p.cloud_cover_pct||0)>12).forEach(p=>{
      const entity=v.entities.add({position:Cesium.Cartesian3.fromDegrees(p.lon,p.lat,25000),point:{
        pixelSize:clamp((p.cloud_cover_pct||0)/5,4,17),color:Cesium.Color.fromCssColorString("#d9e9f2").withAlpha(0.12+(p.cloud_cover_pct||0)/180),
        outlineColor:Cesium.Color.WHITE.withAlpha(0.08),outlineWidth:1,disableDepthTestDistance:Number.POSITIVE_INFINITY
      }});
      cloudEntities.current.push(entity);
    });
  },[cloudOn,windGrid]);

  useEffect(()=>{
    const v=viewer.current;if(!v)return;
    cycloneEntities.current.forEach(e=>v.entities.remove(e));cycloneEntities.current=[];
    cyclones.forEach(event=>{
      const coords=event.coordinates||[];if(!coords.length)return;
      if(coords.length>1){
        const path=v.entities.add({polyline:{positions:coords.map(p=>Cesium.Cartesian3.fromDegrees(p.lon,p.lat,50000)),width:3,material:Cesium.Color.fromCssColorString("#ffb36b"),arcType:Cesium.ArcType.GEODESIC}});
        cycloneEntities.current.push(path);
      }
      const last=coords[coords.length-1];
      const pin=v.entities.add({position:Cesium.Cartesian3.fromDegrees(last.lon,last.lat,60000),point:{pixelSize:10,color:Cesium.Color.fromCssColorString("#ff765f"),outlineColor:Cesium.Color.WHITE,outlineWidth:2},label:{text:event.title,font:"11px sans-serif",fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,style:Cesium.LabelStyle.FILL_AND_OUTLINE,verticalOrigin:Cesium.VerticalOrigin.BOTTOM,pixelOffset:new Cesium.Cartesian2(0,-12)}});
      cycloneEntities.current.push(pin);
    });
  },[cyclones]);

  useEffect(()=>{
    if(!historyPlaying)return;
    const id=window.setInterval(()=>setHistoryOffset(v=>v>=7?1:v+1),1600);
    return()=>window.clearInterval(id);
  },[historyPlaying]);

  const current=weather?.current;
  const codeLabel=(code?:number)=>code==null?"—":[0].includes(code)?"Clear":[1,2,3].includes(code)?"Partly cloudy":[45,48].includes(code)?"Fog":[51,53,55,56,57].includes(code)?"Drizzle":[61,63,65,66,67,80,81,82].includes(code)?"Rain":[95,96,99].includes(code)?"Thunderstorm":"Variable";
  const hourly=atmosphere?.hourly||weather?.hourly||{};
  const times=(hourly.time||[]) as string[];
  const rain=(hourly.precipitation_probability||[]) as number[];
  const precip=(hourly.precipitation||[]) as number[];
  const evap=(hourly.evapotranspiration||[]) as number[];
  const humidity=(hourly.relative_humidity_2m||[]) as number[];
  const healthStatus=(id:string)=>health.find(h=>h.id===id)?.status||"checking";
  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">◎</span><span>EARTH <b>WEATHER</b><small>GLOBAL INTELLIGENCE SYSTEM</small></span></a>
      <div className="top-status"><span className="live-dot"/>{health.filter(h=>h.status==="online").length}/{health.length||4} DATA FEEDS ONLINE <b>LIVE CHECK</b></div>
      <button className="location-btn" onClick={locate} disabled={busy}>⌖ <span>{busy?"LOCATING…":"USE MY LOCATION"}</span></button>
    </header>
    <section className="workspace">
      <div className="globe-wrap">
        <div ref={globeHost} className="globe"/>
        <div className="globe-overlay"><div className="eyebrow">PLANETARY MONITOR</div><div className="globe-title">Earth, in motion.</div><div className="globe-subtitle">Global model wind · cloud field · storm events · satellite observations</div></div>
        <div className="globe-controls">
          <select className="layer-select" aria-label="Satellite imagery layer" value={selectedSatellite} onChange={e=>setSelectedSatellite(e.target.value)}>
            <option value="VIIRS">NASA VIIRS · GLOBAL</option><option value="GOES East">GOES · EAST</option><option value="GOES West">GOES · WEST</option><option value="GOES East IR">GOES · INFRARED</option><option value="Rain Radar">RAIN RADAR · PAST FRAMES</option>
          </select>
          <button className={layerOn?"active":""} onClick={()=>setLayerOn(v=>!v)}>◉ <span>IMAGERY</span></button>
          <button className={windOn?"active":""} onClick={()=>setWindOn(v=>!v)}>≋ <span>WIND</span></button>
          <button className={cloudOn?"active":""} onClick={()=>setCloudOn(v=>!v)}>☁ <span>CLOUD</span></button>
          <button onClick={()=>viewer.current?.camera.flyHome(2)}>◎ <span>GLOBAL</span></button>
        </div>
        {windOn&&<div className="layer-legend wind-legend">WIND FLOW · 10 m MODEL · 30° GRID</div>}
        {cloudOn&&<div className="layer-legend cloud-legend">CLOUD COVER · MODEL FIELD · ADVECTED VISUAL LAYER</div>}
        {selectedSatellite==="VIIRS"&&<div className="history-timeline">
          <div><b>HISTORICAL SATELLITE PLAYBACK</b><span>{dateUTC(historyOffset)} · VIIRS DAILY</span></div>
          <input aria-label="Satellite history day" type="range" min="1" max="7" value={historyOffset} onChange={e=>{setHistoryPlaying(false);setHistoryOffset(Number(e.target.value));}}/>
          <button onClick={()=>setHistoryPlaying(v=>!v)}>{historyPlaying?"PAUSE":"PLAY 7-DAY LOOP"}</button>
          <small>Daily global imagery; availability and acquisition time vary by product.</small>
        </div>}
        {selectedSatellite==="Rain Radar"&&<div className="radar-timeline"><div><b>PRECIPITATION RADAR</b><span>{radarFrames[radarIndex]?new Date(radarFrames[radarIndex].time*1000).toLocaleTimeString():"LOADING FRAMES"}</span></div><input aria-label="Radar time frame" type="range" min="0" max={Math.max(0,radarFrames.length-1)} value={radarIndex} disabled={!radarFrames.length} onChange={e=>setRadarIndex(Number(e.target.value))}/><small>Historical radar only · incomplete coverage · no free nowcast.</small></div>}
        <div className="attribution">NASA GIBS / NOAA · Open-Meteo · NASA EONET · © OpenStreetMap</div>
      </div>
      <aside className="side-panel">
        <div className="panel-head"><div><div className="eyebrow">LOCAL CONDITIONS</div><h1>{place}</h1></div><span className="refresh-indicator">{busy?"● SYNC":"● READY"}</span></div>
        <p className="status-line">{message}</p>
        <div className="current-weather"><div><div className="eyebrow">MODEL CURRENT</div><div className="temperature">{fmt(current?.temperature_2m,"°")}<span>C</span></div><div className="condition">{codeLabel(current?.weather_code)}</div></div><div className="weather-symbol">☁</div></div>
        <div className="metric-grid">
          <Metric label="FEELS LIKE" value={fmt(current?.apparent_temperature,"°C")} icon="◌"/><Metric label="HUMIDITY" value={fmt(current?.relative_humidity_2m,"%")} icon="◍"/>
          <Metric label="WIND SPEED" value={fmt(current?.wind_speed_10m," km/h")} icon="≋"/><Metric label="CLOUD COVER" value={fmt(current?.cloud_cover,"%")} icon="☁"/>
          <Metric label="PRESSURE" value={fmt(current?.pressure_msl," hPa")} icon="⌁"/><Metric label="PRECIPITATION" value={fmt(current?.precipitation," mm")} icon="♧"/>
        </div>
        <div className="tabs">
          <button className={panel==="overview"?"selected":""} onClick={()=>setPanel("overview")}>OVERVIEW</button>
          <button className={panel==="atmosphere"?"selected":""} onClick={()=>setPanel("atmosphere")}>ATMOSPHERE</button>
          <button className={panel==="sources"?"selected":""} onClick={()=>setPanel("sources")}>SOURCES</button>
        </div>
        {panel==="overview"?<div className="forecast">
          <div className="section-title">RAINFALL FORECAST <span>HOURLY MODEL</span></div>
          {times.slice(0,8).map((t,i)=><div className="rain-row" key={t}><span>{new Date(t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span><div className="rain-track"><i style={{width:`${clamp(rain[i]||0,0,100)}%`}}/></div><b>{fmt(rain[i],"%")}</b><small>{(precip[i]||0).toFixed(1)} mm</small></div>)}
          {!times.length&&<div className="empty-state">Allow location to load forecast fields.</div>}
          <div className="section-title storm-heading">ACTIVE SEVERE-STORM EVENTS <span>NASA EONET · {cyclones.length}</span></div>
          {cyclones.slice(0,4).map(e=><a className="storm-row" key={e.id} href={e.link||"#"} target="_blank" rel="noreferrer">{e.title}<span>↗</span></a>)}
          {!cyclones.length&&<div className="empty-state compact">No active EONET severe-storm events returned.</div>}
          <div className="data-note">Wind and rainfall are numerical weather-model outputs. EONET is curated event metadata, not a complete official cyclone warning feed.</div>
        </div>:panel==="atmosphere"?<div className="forecast">
          <div className="section-title">ATMOSPHERIC WATER CYCLE <span>MODEL FIELDS</span></div>
          <Metric label="RELATIVE HUMIDITY" value={fmt(current?.relative_humidity_2m,"%")} icon="◍"/>
          <Metric label="CLOUD WATER / COVER" value={fmt(current?.cloud_cover,"%")} icon="☁"/>
          <Metric label="EVAPOTRANSPIRATION · NEXT HOUR" value={evap[0]!=null?`${Number(evap[0]).toFixed(2)} mm`:"—"} icon="↟"/>
          <Metric label="DEW POINT" value={fmt((hourly.dew_point_2m?.[0] as number|undefined),"°C")} icon="◌"/>
          <div className="section-title storm-heading">HUMIDITY TREND <span>HOURLY</span></div>
          {times.slice(0,8).map((t,i)=><div className="rain-row" key={t}><span>{new Date(t).toLocaleTimeString([],{hour:"2-digit"})}</span><div className="rain-track humidity-track"><i style={{width:`${clamp(humidity[i]||0,0,100)}%`}}/></div><b>{fmt(humidity[i],"%")}</b></div>)}
          <div className="data-note">{atmosphere?.note||"Evapotranspiration is a modeled surface water-flux estimate, not a direct measurement of atmospheric evaporation."}</div>
        </div>:<div className="source-list">
          <div className="section-title">LIVE SOURCE HEALTH <span>60-SECOND CHECK</span></div>
          {sources.map(s=>{const h=health.find(x=>x.id===s.id);const status=h?.status||s.status;return <div className="source-row" key={s.id}><div><b>{s.name}</b><small>{s.coverage} · {h?.latency_ms!=null?`${h.latency_ms} ms`:s.update}</small><p>{s.note}</p></div><span className={status==="online"||status==="connected"?"source-status connected":"source-status"}>{status.toUpperCase()}</span></div>;})}
          <div className="data-note">Health checks measure endpoint reachability, not freshness, accuracy or geographic coverage.</div>
        </div>}
        <footer className="panel-footer">{coords?`LAT ${coords.lat.toFixed(3)} / LON ${coords.lon.toFixed(3)}`:"GLOBAL MODE · LOCATION NOT SET"}<span>{current?.time?new Date(current.time).toLocaleString():"WAITING FOR DATA"}</span></footer>
      </aside>
    </section>
    <footer className="bottom-bar"><span>EARTH WEATHER <b>0.2.0 ATMOSPHERE</b></span><span>OPEN-METEO · NASA GIBS · EONET</span><span>NOT FOR EMERGENCY USE</span></footer>
  </main>;
}
function Metric({label,value,icon}:{label:string;value:string;icon:string}){return <div className="metric"><span className="metric-icon">{icon}</span><div><small>{label}</small><b>{value}</b></div></div>;}
