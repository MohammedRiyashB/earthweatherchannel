import { useCallback, useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { auth, firestore, googleProvider, realtimeDb, enableAnalytics, firebaseReady } from "./firebase";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { onValue, ref, set } from "firebase/database";

type HourlyFields = { time: string[]; [key: string]: (string | number | null)[] | undefined; precipitation_probability?: number[]; precipitation?: number[]; temperature_2m?: number[]; wind_speed_10m?: number[]; evapotranspiration?: number[]; relative_humidity_2m?: number[]; dew_point_2m?: number[] };
type Weather = {
  latitude: number; longitude: number; timezone?: string;
  current?: { time: string; temperature_2m?: number; relative_humidity_2m?: number; apparent_temperature?: number; precipitation?: number; cloud_cover?: number; pressure_msl?: number; wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number; weather_code?: number };
  hourly?: HourlyFields;
};
type Source = { id: string; name: string; kind: string; coverage: string; status: string; update: string; note: string };
type RadarFrame = { time: number; path: string };
type WindPoint = {lat:number;lon:number;speed_kmh:number;direction_deg:number;gust_kmh?:number;cloud_cover_pct?:number;humidity_pct?:number;precipitation_mm?:number};
type Atmosphere = {hourly?: HourlyFields; note?:string; source?:string};
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
  const cloudMotion = useRef<{lat:number;lon:number;entity:Cesium.Entity}[]>([]);
  const rainEntities = useRef<Cesium.Entity[]>([]);
  const cycloneEntities = useRef<Cesium.Entity[]>([]);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [cloudSync, setCloudSync] = useState("NOT CONNECTED");
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
  const [searchText, setSearchText] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("explore");
  const [showLayers, setShowLayers] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<string[]>([]);
  const satelliteLayer = useRef<Cesium.ImageryLayer | null>(null);

  useEffect(() => {
    if (!firebaseReady || !auth) return;
    enableAnalytics();
    return onAuthStateChanged(auth, setFirebaseUser);
  }, []);

  useEffect(() => {
    if (!firebaseUser || !realtimeDb) { setCloudSync(firebaseReady ? "SIGN IN TO SYNC" : "CONFIG REQUIRED"); return; }
    const liveRef = ref(realtimeDb, `users/${firebaseUser.uid}/liveWeather`);
    return onValue(liveRef, snapshot => setCloudSync(snapshot.exists() ? "REALTIME SYNC" : "READY TO SYNC"), () => setCloudSync("DATABASE RULES CHECK"));
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !coords || !weather) return;
    const payload = {
      location: { latitude: coords.lat, longitude: coords.lon, label: place },
      current: weather.current || {},
      modelSource: "Open-Meteo",
      updatedAt: Date.now()
    };
    if (realtimeDb) set(ref(realtimeDb, `users/${firebaseUser.uid}/liveWeather`), payload).catch(() => setCloudSync("DATABASE RULES CHECK"));
    if (firestore) setDoc(doc(firestore, "users", firebaseUser.uid), {
      email: firebaseUser.email || null,
      displayName: firebaseUser.displayName || null,
      lastLocation: payload.location,
      lastWeather: payload.current,
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(() => setCloudSync("FIRESTORE RULES CHECK"));
  }, [firebaseUser, coords, weather, place]);

  const handleGoogleSignIn = useCallback(async () => {
    if (!auth) { setMessage("Firebase is not configured. Add the VITE_FIREBASE_* variables."); return; }
    setAuthBusy(true);
    try { await signInWithPopup(auth, googleProvider); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Google sign-in failed."); }
    finally { setAuthBusy(false); }
  }, []);
  const handleSignOut = useCallback(async () => { if (!auth) return; try { await signOut(auth); } catch { setMessage("Could not sign out. Try again."); } }, []);

  useEffect(() => {
    if (!globeHost.current || viewer.current) return;
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) Cesium.Ion.defaultAccessToken = token;
    const v = new Cesium.Viewer(globeHost.current, {
      animation:false,timeline:false,geocoder:false,homeButton:false,sceneModePicker:false,
      navigationHelpButton:false,baseLayerPicker:false,fullscreenButton:false,infoBox:false,
      selectionIndicator:false,shouldAnimate:true,baseLayer:false,
      terrainProvider:new Cesium.EllipsoidTerrainProvider()
    });
    v.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", credit:"Esri World Imagery"}));
    v.scene.globe.enableLighting = true;
    if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true;
    v.scene.globe.showGroundAtmosphere = true;
    v.camera.setView({destination:Cesium.Cartesian3.fromDegrees(15,18,25500000)});
    const nasa = new Cesium.UrlTemplateImageryProvider({
      url:`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${dateUTC(1)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      maximumLevel:9,credit:"NASA GIBS / VIIRS SNPP"
    });
    const layer=v.imageryLayers.addImageryProvider(nasa); layer.alpha=0.58; satelliteLayer.current=layer; viewer.current=v;
    return () => { particles.current=[];cloudEntities.current=[];cloudMotion.current=[];rainEntities.current=[];cycloneEntities.current=[];v.destroy();viewer.current=null;satelliteLayer.current=null; };
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
      const point=v.entities.add({position:new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(lon,lat,18000)),show:windOn,point:{pixelSize:2.4,color:Cesium.Color.fromCssColorString("#8be9ff").withAlpha(0.9),disableDepthTestDistance:Number.POSITIVE_INFINITY}});
      let particle!:Particle;
      const line=v.entities.add({polyline:{positions:new Cesium.CallbackProperty(()=>particle.trail,false),width:1.2,material:Cesium.Color.fromCssColorString("#65d8ee").withAlpha(0.42),arcType:Cesium.ArcType.NONE},show:windOn});
      particle={lat,lon,trail:[],point,line,speed:wind.speed_kmh,direction:wind.direction_deg};particles.current.push(particle);
    }
  },[windGrid,windOn]);

  useEffect(()=>{
    const v=viewer.current;if(!v||!windGrid.length)return;
    let last=performance.now(),id=0;
    const animate=(now:number)=>{
      const dt=Math.min((now-last)/1000,0.08);last=now;
      for(const p of particles.current){
        const w=nearestWind(p.lat,p.lon,windGrid);p.speed=w.speed_kmh;p.direction=w.direction_deg;
        const radians=(p.direction+180)*Math.PI/180,km=p.speed*dt/3600*18;
        p.lat=clamp(p.lat+Math.cos(radians)*km/111,-72,72);
        p.lon+=Math.sin(radians)*km/(111*Math.max(0.18,Math.cos(p.lat*Math.PI/180)));
        if(p.lon>180)p.lon-=360;if(p.lon< -180)p.lon+=360;
        p.trail.push(Cesium.Cartesian3.fromDegrees(p.lon,p.lat,18000));if(p.trail.length>7)p.trail.shift();
        p.point.position=new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(p.lon,p.lat,18000));
      }
      for(const cloud of cloudMotion.current){
        const cw=nearestWind(cloud.lat,cloud.lon,windGrid),a=(cw.direction_deg+180)*Math.PI/180,step=cw.speed_kmh*dt/3600*12;
        cloud.lat=clamp(cloud.lat+Math.cos(a)*step/111,-72,72);
        cloud.lon+=Math.sin(a)*step/(111*Math.max(0.18,Math.cos(cloud.lat*Math.PI/180)));
        if(cloud.lon>180)cloud.lon-=360;if(cloud.lon< -180)cloud.lon+=360;
        cloud.entity.position=new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(cloud.lon,cloud.lat,25000));
      }
      id=requestAnimationFrame(animate);
    };
    id=requestAnimationFrame(animate);return()=>cancelAnimationFrame(id);
  },[windGrid]);

  useEffect(()=>{
    const v=viewer.current;if(!v)return;
    cloudEntities.current.forEach(e=>v.entities.remove(e));cloudEntities.current=[];cloudMotion.current=[];
    if(!cloudOn||!windGrid.length)return;
    windGrid.filter(p=>(p.cloud_cover_pct||0)>12).forEach(p=>{
      const entity=v.entities.add({position:new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(p.lon,p.lat,25000)),point:{
        pixelSize:clamp((p.cloud_cover_pct||0)/5,4,17),color:Cesium.Color.fromCssColorString("#d9e9f2").withAlpha(0.12+(p.cloud_cover_pct||0)/180),
        outlineColor:Cesium.Color.WHITE.withAlpha(0.08),outlineWidth:1,disableDepthTestDistance:Number.POSITIVE_INFINITY
      }});
      cloudEntities.current.push(entity);cloudMotion.current.push({lat:p.lat,lon:p.lon,entity});
    });
  },[cloudOn,windGrid]);

  useEffect(()=>{
    const v=viewer.current;if(!v)return;
    rainEntities.current.forEach(e=>v.entities.remove(e));rainEntities.current=[];
    if(!rainOn||!windGrid.length)return;
    windGrid.filter(p=>(p.precipitation_mm||0)>0.1).forEach(p=>{
      const entity=v.entities.add({position:Cesium.Cartesian3.fromDegrees(p.lon,p.lat,35000),point:{pixelSize:clamp((p.precipitation_mm||0)*3,4,13),color:Cesium.Color.fromCssColorString("#4da8ff").withAlpha(0.7),outlineColor:Cesium.Color.WHITE.withAlpha(0.2),outlineWidth:1,disableDepthTestDistance:Number.POSITIVE_INFINITY}});
      rainEntities.current.push(entity);
    });
  },[rainOn,windGrid]);

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

  const searchPlace = useCallback(async () => {
    const q=searchText.trim(); if(!q)return;
    setSearchBusy(true);
    try { const response=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`); if(!response.ok)throw new Error("Place search is unavailable"); const results=await response.json(); if(!results.length)throw new Error("No matching place found"); const p=results[0]; await loadWeather(Number(p.lat),Number(p.lon),p.display_name.split(",").slice(0,2).join(",")); }
    catch(e){setMessage(e instanceof Error?e.message:"Could not search for that place.");} finally{setSearchBusy(false);}
  },[searchText,loadWeather]);
  const saveCurrentPlace=()=>{if(place!=="Global view")setSavedPlaces(v=>v.includes(place)?v:[...v,place]);};
  const current=weather?.current;
  const codeLabel=(code?:number)=>code==null?"—":[0].includes(code)?"Clear":[1,2,3].includes(code)?"Partly cloudy":[45,48].includes(code)?"Fog":[51,53,55,56,57].includes(code)?"Drizzle":[61,63,65,66,67,80,81,82].includes(code)?"Rain":[95,96,99].includes(code)?"Thunderstorm":"Variable";
  const hourly=atmosphere?.hourly||weather?.hourly||({time:[]} as HourlyFields);
  const times=hourly.time||[];
  const rain=hourly.precipitation_probability||[];
  const precip=hourly.precipitation||[];
  const evap=hourly.evapotranspiration||[];
  const humidity=hourly.relative_humidity_2m||[];
  const [workspace,setWorkspace]=useState<"explore"|"projects"|"settings"|"layers"|"measure"|"help">("explore");
  const [theme,setTheme]=useState<"dark"|"light">("dark");
  const [showMenu,setShowMenu]=useState(false);
  const [projectName,setProjectName]=useState("Untitled project");
  const [projects,setProjects]=useState<string[]>(["Weather monitoring","Saved places"]);
  const [measureMode,setMeasureMode]=useState<"distance"|"area">("distance");
  const [showLabels,setShowLabels]=useState(true);
  const [showBorders,setShowBorders]=useState(true);
  const [showRoads,setShowRoads]=useState(false);
  const [show3D,setShow3D]=useState(true);
  const [unit,setUnit]=useState("Metric");
  const fileInput=useRef<HTMLInputElement>(null);
  const openWorkspace=(next:typeof workspace)=>{setWorkspace(next);setShowMenu(false);};
  const addProject=()=>{const name=window.prompt("Project name");if(name?.trim()){setProjects(v=>[...v,name.trim()]);setProjectName(name.trim());setWorkspace("projects");}};
  const downloadKml=()=>{const kml='<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>'+projectName+'</name></Document></kml>';const blob=new Blob([kml],{type:"application/vnd.google-earth.kml+xml"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=projectName.replace(/[^a-z0-9]+/gi,"-")+".kml";a.click();URL.revokeObjectURL(url);};
  const importKml=(file?:File)=>{if(!file)return;const reader=new FileReader();reader.onload=()=>{setMessage("Imported file: "+file.name+". KML/KMZ parsing and rendering will be connected next.");};reader.readAsArrayBuffer(file);};
  return <main className={`earth-shell ${theme}`}>
    <div className="earth-map" ref={globeHost}/>
    <header className="earth-header">
      <button className="earth-brand" onClick={()=>openWorkspace("explore")}><span className="earth-logo">◉</span><span>Google Earth<small>EARTH WEATHER</small></span></button>
      <div className="earth-search"><span>⌕</span><input value={searchText} onChange={e=>setSearchText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void searchPlace();}} placeholder="Search Google Earth"/><button onClick={()=>void searchPlace()} disabled={searchBusy}>{searchBusy?"…":"Search"}</button></div>
      <div className="earth-header-actions"><button onClick={()=>void handleGoogleSignIn()}>{firebaseUser?.displayName||"Sign in"}</button><button className="avatar" onClick={()=>setShowMenu(v=>!v)}>{firebaseUser?.photoURL?<img src={firebaseUser.photoURL} alt=""/>:"●"}</button></div>
    </header>
    <div className="earth-menubar">
      {["File","Edit","View","Add","Tools","Help"].map((m,i)=><button key={m} onClick={()=>i===0?setShowMenu(v=>!v):i===2?openWorkspace("layers"):i===3?openWorkspace("measure"):i===4?openWorkspace("measure"):openWorkspace("help")}>{m}</button>)}
      <span className="earth-location">{place}</span>
    </div>
    <aside className="earth-sidebar">
      <div className="earth-sidebar-tabs">
        <button className={workspace==="explore"?"sel":""} onClick={()=>openWorkspace("explore")}>Explore</button>
        <button className={workspace==="projects"?"sel":""} onClick={()=>openWorkspace("projects")}>Projects</button>
      </div>
      {workspace==="explore"&&<div className="earth-side-content">
        <h3>Explore</h3><button className="earth-row" onClick={()=>locate()}>◎ <span>I'm Feeling Lucky / My location</span></button>
        <button className="earth-row" onClick={()=>setSelectedSatellite("VIIRS")}>◉ <span>Satellite imagery</span></button>
        <button className="earth-row" onClick={()=>setSelectedSatellite("Rain Radar")}>▧ <span>Weather radar</span></button>
        <button className="earth-row" onClick={()=>openWorkspace("layers")}>▤ <span>Map style and layers</span></button>
        <button className="earth-row" onClick={()=>openWorkspace("measure")}>⌁ <span>Measure distance and area</span></button>
        <div className="earth-side-section">MAP DATA</div>
        <label className="earth-check"><input type="checkbox" checked={layerOn} onChange={e=>setLayerOn(e.target.checked)}/> Satellite imagery</label>
        <label className="earth-check"><input type="checkbox" checked={windOn} onChange={e=>setWindOn(e.target.checked)}/> Wind animation</label>
        <label className="earth-check"><input type="checkbox" checked={cloudOn} onChange={e=>setCloudOn(e.target.checked)}/> Cloud cover</label>
        <label className="earth-check"><input type="checkbox" checked={rainOn} onChange={e=>setRainOn(e.target.checked)}/> Precipitation</label>
        <label className="earth-check"><input type="checkbox" checked={showBorders} onChange={e=>setShowBorders(e.target.checked)}/> Borders and labels</label>
      </div>}
      {workspace==="projects"&&<div className="earth-side-content"><div className="earth-side-title"><h3>Projects</h3><button onClick={addProject}>＋ New</button></div><p className="earth-muted">Create maps and organise places.</p>{projects.map(p=><button className="earth-project" key={p} onClick={()=>setProjectName(p)}>▱ <span>{p}<small>Saved project</small></span><b>⋮</b></button>)}<button className="earth-row" onClick={()=>fileInput.current?.click()}>⇧ <span>Import KML or KMZ</span></button><input ref={fileInput} hidden type="file" accept=".kml,.kmz,.geojson,.json" onChange={e=>importKml(e.target.files?.[0])}/><button className="earth-row" onClick={downloadKml}>⇩ <span>Export current project as KML</span></button></div>}
      {workspace==="layers"&&<div className="earth-side-content"><h3>Map style</h3><p className="earth-muted">Choose what appears on the map.</p><label className="earth-check"><input type="checkbox" checked={layerOn} onChange={e=>setLayerOn(e.target.checked)}/> Satellite</label><label className="earth-check"><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/> Labels</label><label className="earth-check"><input type="checkbox" checked={showBorders} onChange={e=>setShowBorders(e.target.checked)}/> Borders</label><label className="earth-check"><input type="checkbox" checked={showRoads} onChange={e=>setShowRoads(e.target.checked)}/> Roads</label><label className="earth-check"><input type="checkbox" checked={show3D} onChange={e=>setShow3D(e.target.checked)}/> 3D buildings and terrain</label><div className="earth-side-section">WEATHER OVERLAYS</div><label className="earth-check"><input type="checkbox" checked={windOn} onChange={e=>setWindOn(e.target.checked)}/> Wind</label><label className="earth-check"><input type="checkbox" checked={cloudOn} onChange={e=>setCloudOn(e.target.checked)}/> Clouds</label><label className="earth-check"><input type="checkbox" checked={rainOn} onChange={e=>setRainOn(e.target.checked)}/> Rain</label></div>}
      {workspace==="measure"&&<div className="earth-side-content"><h3>Measure</h3><p className="earth-muted">Measure distance or area on the globe.</p><div className="earth-switch"><button className={measureMode==="distance"?"sel":""} onClick={()=>setMeasureMode("distance")}>Distance</button><button className={measureMode==="area"?"sel":""} onClick={()=>setMeasureMode("area")}>Area</button></div><p className="earth-muted">Click points on the globe to create a measurement. Measurement drawing is the next interaction layer to wire.</p><button className="earth-primary" onClick={()=>setMessage("Measurement tool selected: "+measureMode)}>Start measuring</button></div>}
      {workspace==="settings"&&<div className="earth-side-content"><h3>Settings</h3><div className="earth-side-section">DISPLAY</div><label className="earth-setting">Theme<select value={theme} onChange={e=>setTheme(e.target.value as "dark"|"light")}><option value="dark">Dark</option><option value="light">Light</option></select></label><div className="earth-side-section">MEASUREMENTS</div><label className="earth-setting">Units<select value={unit} onChange={e=>setUnit(e.target.value)}><option>Metric</option><option>Imperial</option></select></label><div className="earth-side-section">ACCOUNT</div><p className="earth-muted">{firebaseUser?.email||"Not signed in"}</p><p className="earth-muted">Cloud sync: {cloudSync}</p><button className="earth-row" onClick={()=>firebaseUser?void handleSignOut():void handleGoogleSignIn()}><span>{firebaseUser?"Sign out":"Sign in with Google"}</span></button></div>}
      {workspace==="help"&&<div className="earth-side-content"><h3>Help</h3><p className="earth-muted">Navigate the globe with your mouse or touch. Search for a place, select a layer, or open Projects to manage your maps.</p><button className="earth-row" onClick={()=>openWorkspace("settings")}>⚙ <span>Settings</span></button></div>}
      <div className="earth-sidebar-footer"><span>EARTH WEATHER</span><button onClick={()=>openWorkspace("settings")}>⚙ Settings</button></div>
    </aside>
    <div className="earth-map-controls"><button title="My location" onClick={()=>locate()}>◎</button><button title="North up" onClick={()=>viewer.current?.camera.setView({orientation:{heading:0,pitch:-Math.PI/2,roll:0}})}>🧭</button><button title="2D / 3D" onClick={()=>viewer.current?.scene.morphTo2D(1)}>2D</button><button title="Zoom in" onClick={()=>viewer.current?.camera.zoomIn(400000)}>＋</button><button title="Zoom out" onClick={()=>viewer.current?.camera.zoomOut(400000)}>−</button></div>
    <div className="earth-weather-card"><span className="live-dot"/><div><b>{fmt(current?.temperature_2m,"°")}C · {codeLabel(current?.weather_code)}</b><small>{place} · {busy?"Updating":"Live weather"}</small></div></div>
    <div className="earth-timeline"><div><b>{selectedSatellite==="Rain Radar"?"Weather radar":"Historical imagery"}</b><span>{selectedSatellite==="Rain Radar"?(radarFrames[radarIndex]?new Date(radarFrames[radarIndex].time*1000).toLocaleTimeString():"Loading"):dateUTC(historyOffset)}</span></div><input type="range" min="1" max="7" value={selectedSatellite==="Rain Radar"?Math.max(1,radarIndex+1):historyOffset} onChange={e=>selectedSatellite==="Rain Radar"?setRadarIndex(Number(e.target.value)-1):setHistoryOffset(Number(e.target.value))}/><button onClick={()=>selectedSatellite==="Rain Radar"?setSelectedSatellite("VIIRS"):setHistoryPlaying(v=>!v)}>{historyPlaying?"Pause":"Play timeline"}</button></div>
    {showMenu&&<div className="earth-menu"><button onClick={addProject}>New project</button><button onClick={()=>fileInput.current?.click()}>Import KML/KMZ</button><button onClick={downloadKml}>Export KML</button><button onClick={()=>openWorkspace("settings")}>Settings</button><button onClick={()=>openWorkspace("help")}>Help</button></div>}
    <div className="earth-status">{message}</div>
  </main>;
}
function Metric({label,value,icon}:{label:string;value:string;icon:string}){return <div className="metric"><span className="metric-icon">{icon}</span><div><small>{label}</small><b>{value}</b></div></div>;}
