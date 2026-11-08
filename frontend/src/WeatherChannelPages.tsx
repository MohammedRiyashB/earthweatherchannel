import { useEffect, useMemo, useState, type ReactNode } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "https://earthweather-api.onrender.com";

export type WeatherChannelMode =
  | "Weather Report" | "Hourly" | "10 Day" | "Radar" | "Allergy"
  | "Air Quality" | "Cold & Flu" | "Storm reports";

export type WeatherLocation = {
  name: string;
  region: string;
  lat: number;
  lon: number;
  country?: string;
  current?: {temperature_2m?:number;apparent_temperature?:number;relative_humidity_2m?:number;wind_speed_10m?:number;wind_direction_10m?:number;cloud_cover?:number;pressure_msl?:number;precipitation?:number;weather_code?:number;time?:string|number};
} | null;

type City = { name: string; region?: string; current?: {temperature_2m?:number;weather_code?:number} };
type Storm = { id: string; title: string; description?: string; link?: string; coordinates?: {lat:number;lon:number;date?:string}[] };
type Forecast = { current?: Record<string, any>; hourly?: Record<string, any[]>; daily?: Record<string, any[]>; source?: {name?:string;provider?:string;url?:string;cache_seconds?:number}; };
type Air = { current?: Record<string,any>; source?: {name?:string;resolution_km?:number}; note?:string };
type Radar = { host?:string; frames?: {time:number;path:string}[]; note?:string };
type Props = {
  mode: WeatherChannelMode;
  location: WeatherLocation;
  cities: City[];
  storms: Storm[];
  onNavigate: (page:string) => void;
  onSearchLocation: () => void;
};

const val = (v:unknown, digits=0) =>
  typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(digits)).toString() : "—";
const condition = (code:unknown) => {
  if (typeof code !== "number") return "Conditions unavailable";
  if (code===0) return "Clear";
  if (code===1) return "Mostly clear";
  if (code===2) return "Partly cloudy";
  if (code===3) return "Overcast";
  if ([45,48].includes(code)) return "Fog";
  if ([51,53,55,56,57].includes(code)) return "Drizzle";
  if ([61,63,65,66,67,80,81,82].includes(code)) return "Rain";
  if ([71,73,75,77,85,86].includes(code)) return "Snow";
  if ([95,96,99].includes(code)) return "Thunderstorms";
  return "Variable conditions";
};
const weatherTime = (v:unknown) => {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
};
const weatherDate = (v:unknown) => {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v.length===10 ? v+"T12:00:00" : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString([], {weekday:"short",day:"numeric",month:"short"});
};
const weatherIcon = (code:unknown) => {
  if (code===0) return "☀";
  if (code===1) return "🌤";
  if (code===2) return "⛅";
  if (code===3) return "☁";
  if (typeof code==="number" && [45,48].includes(code)) return "🌫";
  if (typeof code==="number" && [95,96,99].includes(code)) return "⛈";
  if (typeof code==="number" && [71,73,75,77,85,86].includes(code)) return "❄";
  if (typeof code==="number" && [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return "🌧";
  return "—";
};
const aqiLabel = (n:number) => n<=50 ? "Good" : n<=100 ? "Moderate" : n<=150 ? "Unhealthy for sensitive groups" : n<=200 ? "Unhealthy" : n<=300 ? "Very unhealthy" : "Hazardous";
const aqiColor = (n:number) => n<=50 ? "#55a96b" : n<=100 ? "#d5b83d" : n<=150 ? "#e58a39" : n<=200 ? "#c95050" : n<=300 ? "#8c5597" : "#713d69";

function NavGlyph({kind}:{kind:string}) {
  const common={viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,className:"inline-block h-6 w-6 shrink-0 text-inherit"};
  if(kind==="forecast") return <svg {...common}><path d="M6 18h11a4 4 0 0 0 .5-8A6 6 0 0 0 6 8a5 5 0 0 0 0 10Z"/><path d="M7 21h8"/></svg>;
  if(kind==="radar") return <svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 6-6"/><path d="M12 3v2"/></svg>;
  if(kind==="allergy") return <svg {...common}><path d="M12 21v-9"/><path d="M12 14c-5 0-7-3-7-7 4 0 7 2 7 7Z"/><path d="M12 11c0-4 3-7 7-7 0 4-2 7-7 7Z"/></svg>;
  if(kind==="air") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M7 15c2-5 8-7 10-2"/><path d="M8 9c1-2 3-3 5-3"/></svg>;
  if(kind==="more") return <svg {...common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>;
  if(kind==="location") return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
  if(kind==="menu") return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>;
}

function WeatherComTabList({mode,onNavigate}:{mode:string;onNavigate:(page:string)=>void}) {
  const tabs:[string,string][]=[
    ["Weather Report","Today"],["Hourly","Hourly"],["10 Day","10 Day"],
    ["Allergy","Allergies"],["Air Quality","Air Quality"],["Cold & Flu","Cold & Flu"]
  ];
  return <div className="relative overflow-hidden rounded-3xl bg-white p-1 shadow-[0_4px_16px_0_rgba(0,0,0,0.08),_0_0_32px_0_rgba(0,0,0,0.12)] md:rounded-[28px] md:mr-auto md:max-w-[min(958px,100%)]" data-testid="subnavigation">
    <div className="scrollbar-hide flex h-10 items-center gap-1 overflow-x-auto md:h-12">
      {tabs.map(([key,label])=><button type="button" key={key} onClick={()=>onNavigate(key)}
        aria-current={mode===key?"page":undefined}
        className={"h-full rounded-3xl px-4 text-sm whitespace-nowrap transition-colors font-bold inline-flex items-center hover:bg-gray-100 active:bg-gray-200 focus-visible:outline-none focus-visible:bg-gray-100 "+(mode===key?"bg-gray-100 text-blue-500":"text-gray-900")}>
        {label}
      </button>)}
    </div>
  </div>;
}

export function WeatherChannelShell({
  active, location, onNavigate, onSearchLocation, onSignIn, userLabel, children
}:{
  active:string; location:WeatherLocation; onNavigate:(page:string)=>void; onSearchLocation:()=>void;
  onSignIn:()=>void; userLabel:string; children:ReactNode;
}) {
  const [moreOpen,setMoreOpen]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const navItems=[
    {key:"Weather Report",label:"Forecasts",kind:"forecast"},
    {key:"Radar",label:"Radar",kind:"radar"},
    {key:"Allergy",label:"Allergy Tracker",kind:"allergy"},
    {key:"Air Quality",label:"Air Quality Index",kind:"air"}
  ];
  const moreItems=[
    ["Satellite imagery","Satellite Intelligence 2.0"],["Satellite Report","Satellite Report"],
    ["Storm reports","Storm Reports"],["World","World Weather News"],
    ["Country","Country Weather News"],["State","State Weather News"],["Local","Local Weather News"]
  ];
  const handleNavigate=(key:string)=>{onNavigate(key);setMoreOpen(false);setMobileOpen(false);};
  const sidebar=(drawer:boolean)=><nav aria-label="Site Navigation Links" data-testid="sidebar-navigation"
    className={drawer?"relative top-0 box-content flex h-screen w-[280px] flex-col gap-8 leading-none bg-white":"relative top-0 box-content flex h-screen w-20 flex-col gap-8 leading-none transition-colors duration-200 max-xl:items-center bg-white/0 xl:w-[200px]"}>
    <div className="mb-0 flex flex-wrap items-center justify-center gap-4 pt-4 leading-none xl:px-4 xl:justify-start">
      <button type="button" onClick={()=>handleNavigate("Weather Report")} aria-label="EARTH WEATHER home" className="border-0 bg-transparent p-0">
        <img src="/logo.png" alt="EARTH WEATHER" className="h-auto w-12 xl:w-40 object-contain"/>
      </button>
    </div>
    <div className="flex w-full flex-1 flex-col gap-2 px-2">
      {navItems.map(item=><button key={item.key} type="button" onClick={()=>handleNavigate(item.key)}
        className={"group relative box-border flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-2xl px-3 font-semibold no-underline transition-[color,background-color,border-color,width,height,padding] duration-200 xl:flex-row xl:justify-start "+(active===item.key?"bg-gray-900 text-white":"bg-transparent text-gray-900 hover:bg-gray-100")}>
        <NavGlyph kind={item.kind}/>
        <p className="tracking-tight line-clamp-1 text-xxs mt-1 h-[13px] pb-0 font-semibold text-inherit transition-opacity duration-200 xl:mt-0 xl:h-auto xl:text-sm xl:leading-none">{item.label}</p>
      </button>)}
      <div className="relative">
        <button type="button" aria-expanded={moreOpen} onClick={()=>setMoreOpen(v=>!v)}
          className={"group relative box-border flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-2xl px-3 font-semibold no-underline transition-[color,background-color,border-color,width,height,padding] duration-200 xl:flex-row xl:justify-start "+(moreOpen?"bg-gray-100 text-gray-900":"bg-transparent text-gray-900 hover:bg-gray-100")}>
          <NavGlyph kind="more"/><p className="tracking-tight line-clamp-1 text-xxs mt-1 h-[13px] pb-0 font-semibold text-inherit transition-opacity duration-200 xl:mt-0 xl:h-auto xl:text-sm xl:leading-none">More</p>
        </button>
        {moreOpen&&<div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl xl:left-full xl:top-0 xl:ml-2">
          {moreItems.map(([key,label])=><button type="button" key={key} onClick={()=>handleNavigate(key)} className="flex w-full items-center rounded-xl px-3 py-3 text-left text-sm text-gray-900 hover:bg-gray-100">{label}</button>)}
        </div>}
      </div>
      <button type="button" onClick={onSignIn} className="mt-auto group relative box-border flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-gray-900 px-3 font-semibold text-white transition-colors xl:flex-row xl:justify-start">
        <svg viewBox="0 0 24 24" className="inline-block h-6 w-6 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6.5 19c1.2-3 3.1-4.5 5.5-4.5s4.3 1.5 5.5 4.5"/></svg>
        <p className="tracking-tight line-clamp-1 text-xxs mt-1 h-[13px] pb-0 font-semibold text-inherit xl:mt-0 xl:h-auto xl:text-sm xl:leading-none">{userLabel}</p>
      </button>
    </div>
  </nav>;

  return <div className="flex min-h-screen items-start bg-white text-black">
    <div className="z-nav sticky top-0 hidden md:block">{sidebar(false)}</div>
    {mobileOpen&&<div className="fixed inset-0 z-[100] bg-black/30 md:hidden" onMouseDown={e=>{if(e.target===e.currentTarget)setMobileOpen(false);}}>
      <div className="h-full w-[min(82vw,300px)] overflow-y-auto bg-white p-3 shadow-2xl">{sidebar(true)}</div>
    </div>}
    <main id="main-content-wrapper" className="min-w-0 shrink grow md:pl-8">
      <header className="relative top-0 w-full md:sticky z-sticky">
        <div className="text-black max-md:bg-white" data-component="header-main" data-testid="header-main">
          <div className="mx-auto flex items-center justify-between gap-2 px-3 py-2 md:gap-4 md:py-3 md:pl-0">
            <span className="contents md:hidden">
              <button type="button" aria-label="Menu" onClick={()=>setMobileOpen(true)} className="rounded-lg active:bg-[#E6E6E6] bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 inline-flex h-10 w-10 shrink-0 cursor-pointer flex-col items-center justify-center p-0 hover:bg-transparent"><NavGlyph kind="menu"/></button>
            </span>
            <div className="flex items-center md:hidden">
              <button type="button" onClick={()=>handleNavigate("Weather Report")} className="border-0 bg-transparent p-0"><img src="/logo.png" alt="EARTH WEATHER" className="h-8 w-auto max-w-[108px] object-contain"/></button>
            </div>
            <div className="relative max-md:mr-auto">
              <div className="rounded-4xl bg-white md:p-1 md:shadow-[0_4px_16px_0_rgba(0,0,0,0.08),_0_0_32px_0_rgba(0,0,0,0.12)]">
                <button type="button" data-testid="location-picker-trigger" aria-label="Search for a location" onClick={onSearchLocation}
                  className="cursor-pointer inline-flex h-10 items-center justify-center gap-2 rounded-3xl px-3 py-0 text-sm font-bold transition-colors md:h-12 md:px-4 focus-visible:ring-offset-0 focus-visible:outline-none bg-gray-900 text-white hover:bg-[#3A3938] active:bg-[#0C0B0B] focus-visible:ring-2 focus-visible:ring-blue-500">
                  <span className="max-w-[140px] truncate md:max-w-[160px]">{location?.name||"Choose location"}</span>
                  <NavGlyph kind="location"/>
                </button>
              </div>
            </div>
            <div className="hidden md:contents"><WeatherComTabList mode={active} onNavigate={handleNavigate}/></div>
            <button type="button" onClick={onSignIn} className="cursor-pointer inline-flex h-10 items-center justify-center rounded-3xl bg-gray-900 px-4 text-sm font-bold text-white hover:bg-[#3A3938] md:h-12">{userLabel}</button>
          </div>
        </div>
      </header>
      <div className="z-sticky sticky top-2 mb-6 px-3 md:hidden block"><WeatherComTabList mode={active} onNavigate={handleNavigate}/></div>
      {children}
    </main>
  </div>;
}

function AdSlot({height="min-h-[280px]",className=""}:{height?:string;className?:string}) {
  return <section aria-label="Advertisement" className={"flex flex-col @container/card text-card-foreground border-0 bg-card region-contentTop adContainer disableHeliosStyles overflow-hidden rounded-3xl "+height+" "+className}>
    <div className="flex min-h-full w-full items-center justify-center py-4 text-center text-xs text-gray-400">Advertisement</div>
  </section>;
}

function WeatherSprite({code}:{code:unknown}) {
  const pos = typeof code==="number" && [95,96,99].includes(code) ? "22% 99.7%" :
    typeof code==="number" && [61,63,65,66,67,80,81,82].includes(code) ? "78% 88%" :
    code===3 ? "44% 99.7%" : code===2 ? "78% 24%" : "44.4631% 99.7619%";
  return <div aria-hidden="true" className="pointer-events-none absolute -inset-px z-0 overflow-hidden rounded-2xl [mask-image:linear-gradient(#000,#000)]">
    <div className="absolute inset-0">
      <div aria-hidden="true" className="WeatherSprite-module__Z3SuQq__sprite" data-weather-sprite="Current" style={{backgroundSize:"1031.25% 1266.6667%",backgroundPosition:pos,backgroundImage:'image-set(url("/_next/static/immutable/media/weather-bg-sprite.2ol3vhh5gt8dk.webp") type("image/webp"), url("/_next/static/immutable/media/weather-bg-sprite.32wix_aaq3qmi.jpg") type("image/jpeg"))'}}/>
    </div>
  </div>;
}

function WeatherSymbol({code}:{code:unknown}) {
  const common={viewBox:"0 0 64 64",className:"h-16 w-16 text-gray-900",fill:"none",stroke:"currentColor",strokeWidth:2.4,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
  if(code===0) return <svg {...common}><circle cx="32" cy="32" r="10"/><path d="M32 5v8M32 51v8M5 32h8M51 32h8M13 13l6 6M45 45l6 6M51 13l-6 6M19 45l-6 6"/></svg>;
  if(code===1||code===2) return <svg {...common}><circle cx="42" cy="20" r="9"/><path d="M42 4v5M42 31v5M26 20h5M53 20h5"/><path d="M13 48h31a9 9 0 0 0 0-18 14 14 0 0 0-26-1 10 10 0 0 0-5 19Z"/></svg>;
  if(code===3||typeof code!=="number") return <svg {...common}><path d="M13 47h35a10 10 0 0 0 0-20 16 16 0 0 0-30-2 11 11 0 0 0-5 22Z"/></svg>;
  if([95,96,99].includes(code as number)) return <svg {...common}><path d="M13 40h35a10 10 0 0 0 0-20 16 16 0 0 0-30-2 11 11 0 0 0-5 22Z"/><path d="m33 36-7 12h8l-4 11 14-18h-9l5-5"/></svg>;
  if([71,73,75,77,85,86].includes(code as number)) return <svg {...common}><path d="M13 38h35a10 10 0 0 0 0-20 16 16 0 0 0-30-2 11 11 0 0 0-5 22Z"/><path d="M24 47v10M19 52h10M40 47v10M35 52h10"/></svg>;
  return <svg {...common}><path d="M13 36h35a10 10 0 0 0 0-20 16 16 0 0 0-30-2 11 11 0 0 0-5 22Z"/><path d="m23 43-4 8M38 43l-4 8M51 43l-4 8"/></svg>;
}

function ForecastChart({times,temperatures}:{times:any[];temperatures:any[]}) {
  const values=temperatures.filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));
  const points=useMemo(()=>{
    if(values.length<2)return "";
    const min=Math.min(...values), max=Math.max(...values), span=Math.max(1,max-min);
    return values.map((v,i)=>(20+i*660/(values.length-1))+","+(120-((v-min)/span)*90)).join(" ");
  },[temperatures]);
  if(!points)return <div className="h-4 max-w-120 animate-pulse rounded-3xl bg-gray-200"/>;
  return <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-3">
    <div className="flex justify-between text-xs text-gray-500"><span>Temperature trend</span><span>°C · next 24 hours</span></div>
    <svg viewBox="0 0 700 150" role="img" aria-label="Hourly temperature chart" className="mt-3 w-full">
      {[35,75,115].map(y=><line key={y} x1="18" x2="682" y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 5"/>)}
      <polyline points={points} fill="none" stroke="#003399" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
      {values.map((v,i)=><circle key={i} cx={20+i*660/(values.length-1)} cy={120-((v-Math.min(...values))/Math.max(1,Math.max(...values)-Math.min(...values)))*90} r="3.5" fill="#fff" stroke="#003399" strokeWidth="2"/>)}
    </svg>
    <div className="flex justify-between text-[10px] text-gray-400"><span>{weatherTime(times[0])}</span><span>{weatherTime(times[Math.min(times.length-1,values.length-1)])}</span></div>
  </div>;
}

function RadarMap({radar,location,playing,onPlayingChange}:{radar:Radar|null;location:WeatherLocation;playing:boolean;onPlayingChange:(v:boolean)=>void}) {
  const [frameIndex,setFrameIndex]=useState(0);
  const [zoom,setZoom]=useState(5);
  const frames=radar?.frames||[];
  const frame=frames[frameIndex]||frames[frames.length-1];
  const tiles=useMemo(()=>{
    if(!location)return [];
    const n=2**zoom;const lat=Math.max(-85.0511,Math.min(85.0511,location.lat))*Math.PI/180;
    const cx=Math.floor((location.lon+180)/360*n);
    const cy=Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*n);
    const out:{x:number;y:number;key:string}[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=((cx+dx)%n+n)%n;const y=cy+dy;if(y>=0&&y<n)out.push({x,y,key:zoom+"-"+x+"-"+y});}
    return out;
  },[location?.lat,location?.lon,zoom]);
  useEffect(()=>{if(!playing||frames.length<2)return;const t=window.setInterval(()=>setFrameIndex(i=>(i+1)%frames.length),1100);return()=>window.clearInterval(t)},[playing,frames.length]);
  useEffect(()=>{if(frames.length)setFrameIndex(frames.length-1)},[radar]);
  return <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 @container/dynamicMap" aria-label="Radar" data-testid="DynamicMap">
    <h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">Radar</h2>
    <div className="relative h-80 @md/dynamicMap:h-100 overflow-hidden rounded-lg bg-[#9fcbf9]">
      {frame&&location?<div className="absolute inset-0 grid grid-cols-3 grid-rows-3">{tiles.map(tile=><div key={tile.key} className="relative overflow-hidden"><img src={"https://tile.openstreetmap.org/"+zoom+"/"+tile.x+"/"+tile.y+".png"} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover"/><img src={(radar?.host||"")+frame.path+"/256/"+zoom+"/"+tile.x+"/"+tile.y+"/2/1_1.png"} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-multiply"/></div>)}</div>:<div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600">Radar coverage is not available for this location.</div>}
      {location&&<span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-white px-2 py-1 text-xs font-bold text-gray-900 shadow">⌖ {location.name}</span>}
      <div className="absolute left-3 right-3 top-3 flex items-center justify-between rounded-xl bg-white/90 px-3 py-2 text-xs text-gray-800">
        <span className="font-bold">RADAR HISTORY</span><span>{frame?new Date(frame.time*1000).toLocaleString():"—"}</span>
      </div>
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 p-2">
        <button type="button" className="rounded-full bg-gray-900 px-3 py-2 text-xs font-bold text-white" onClick={()=>onPlayingChange(!playing)}>{playing?"Ⅱ Pause":"▶ Play"}</button>
        <input type="range" min="0" max={Math.max(0,frames.length-1)} value={Math.max(0,frameIndex)} onChange={e=>{onPlayingChange(false);setFrameIndex(Number(e.target.value));}} aria-label="Radar timeline" className="min-w-24 flex-1"/>
        <span className="text-xs text-gray-600">{frames.length?frameIndex+1+"/"+frames.length:"—"}</span>
        <button type="button" className="rounded-full border px-3 py-2 text-xs" onClick={()=>setZoom(v=>Math.min(7,v+1))} disabled={zoom>=7}>+</button>
        <button type="button" className="rounded-full border px-3 py-2 text-xs" onClick={()=>setZoom(v=>Math.max(3,v-1))} disabled={zoom<=3}>−</button>
      </div>
    </div>
    <div className="flex flex-wrap justify-between gap-2 py-2 text-[10px] text-gray-500"><span>Radar tiles by RainViewer</span><span>Map data © OpenStreetMap contributors</span></div>
    <p className="text-xs leading-relaxed text-gray-500">{radar?.note||"Historical radar frames only; coverage and update interval depend on the provider."}</p>
  </section>;
}

export function WeatherChannelPage({mode,location,cities,storms,onNavigate,onSearchLocation}:Props) {
  const [forecast,setForecast]=useState<Forecast|null>(null);
  const [forecastLoading,setForecastLoading]=useState(false);
  const [forecastError,setForecastError]=useState("");
  const [air,setAir]=useState<Air|null>(null);
  const [airLoading,setAirLoading]=useState(false);
  const [airError,setAirError]=useState("");
  const [radar,setRadar]=useState<Radar|null>(null);
  const [radarError,setRadarError]=useState("");
  const [radarPlaying,setRadarPlaying]=useState(false);
  const [reload,setReload]=useState(0);

  useEffect(()=>{
    if(!location){setForecast(null);setForecastError("Choose a location to view the forecast.");return;}
    const controller=new AbortController();setForecastLoading(true);setForecastError("");
    const q=new URLSearchParams({latitude:String(location.lat),longitude:String(location.lon),days:"10",timezone:"auto"});
    fetch(API+"/api/forecast?"+q.toString(),{cache:"no-store",signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error("Forecast temporarily unavailable");return r.json() as Promise<Forecast>;})
      .then(setForecast).catch(e=>{if(!controller.signal.aborted)setForecastError(e instanceof Error?e.message:"Forecast unavailable");})
      .finally(()=>{if(!controller.signal.aborted)setForecastLoading(false);});
    return()=>controller.abort();
  },[location?.lat,location?.lon,reload]);

  useEffect(()=>{
    if(!location || (mode!=="Weather Report" && mode!=="Air Quality"))return;
    const controller=new AbortController();setAirLoading(true);setAirError("");
    const q=new URLSearchParams({latitude:String(location.lat),longitude:String(location.lon),days:"5"});
    fetch(API+"/api/air-quality?"+q.toString(),{cache:"no-store",signal:controller.signal})
      .then(async r=>{if(!r.ok)throw new Error("Air-quality model unavailable");return r.json() as Promise<Air>;})
      .then(setAir).catch(e=>{if(!controller.signal.aborted)setAirError(e instanceof Error?e.message:"Air-quality data unavailable");})
      .finally(()=>{if(!controller.signal.aborted)setAirLoading(false);});
    return()=>controller.abort();
  },[mode,location?.lat,location?.lon,reload]);

  useEffect(()=>{
    if(mode!=="Radar" && mode!=="Weather Report")return;
    let active=true;
    const load=async()=>{try{const r=await fetch(API+"/api/radar",{cache:"no-store"});if(!r.ok)throw new Error("Radar data unavailable");const d=await r.json() as Radar;if(active){setRadar(d);setRadarError("");}}catch(e){if(active)setRadarError(e instanceof Error?e.message:"Radar data unavailable");}};
    void load();const timer=window.setInterval(()=>void load(),10*60*1000);return()=>{active=false;window.clearInterval(timer);};
  },[mode,reload]);

  const current=location?.current||forecast?.current||{};
  const hourly=forecast?.hourly||{};
  const daily=forecast?.daily||{};
  const hourTimes=(hourly.time||[]).slice(0,24);
  const dailyTimes=(daily.time||[]).slice(0,10);
  const source=forecast?.source?.name||forecast?.source?.provider||"Configured forecast provider";
  const pollenBlank=mode==="Allergy" || mode==="Cold & Flu";
  const title=mode==="Weather Report"?(location?.name||"Local")+" Weather":mode==="Hourly"?(location?.name||"Local")+" Hourly Forecast":mode==="10 Day"?(location?.name||"Local")+" 10 Day Forecast":mode==="Air Quality"?(location?.name||"Local")+" Air Quality":mode==="Allergy"?(location?.name||"Local")+" Allergy Forecast":mode==="Cold & Flu"?"Cold & Flu":mode==="Radar"?(location?.name||"Local")+" Interactive Radar":"Storm Reports";

  const renderDailyRows=(limit:number)=>dailyTimes.slice(0,limit).map((date,i)=><div className="border-grey-500 @container/dailyItem overflow-hidden max-sm:border-b" key={String(date)+i}>
    <div className="flex min-h-14 items-center gap-3 @lg/dailyItem:gap-2 @lg/dailyItem:px-3 py-2">
      <div className="min-w-24 flex-1 text-sm font-medium text-gray-900">{i===0?"Today":weatherDate(date)}</div>
      <div className="flex w-9 items-center justify-center text-2xl">{weatherIcon(daily.weather_code?.[i])}</div>
      <div className="hidden min-w-20 flex-1 text-sm text-gray-700 sm:block">{condition(daily.weather_code?.[i])}</div>
      <div className="w-16 text-right text-xs text-gray-500">Rain {daily.precipitation_sum?.[i]!=null?val(daily.precipitation_sum[i],1)+" mm":"—"}</div>
      <div className="hidden w-16 text-right text-xs text-gray-500 md:block">Wind {daily.wind_speed_10m_max?.[i]!=null?val(daily.wind_speed_10m_max[i],1):"—"}</div>
      <div className="w-24 text-right text-sm font-semibold text-gray-900">{val(daily.temperature_2m_min?.[i])}° <span className="mx-1 text-gray-400">/</span> {val(daily.temperature_2m_max?.[i])}°</div>
    </div>
  </div>);

  const renderHourlyRows=()=>hourTimes.map((time,i)=><div className="border-grey-500 @container/dailyItem overflow-hidden max-sm:border-b" key={String(time)+i}>
    <div className="flex min-h-14 items-center gap-3 @lg/dailyItem:gap-2 @lg/dailyItem:px-3 py-2">
      <div className="w-16 text-sm font-medium text-gray-900">{i===0?"Now":weatherTime(time)}</div>
      <div className="flex w-9 items-center justify-center text-2xl">{weatherIcon(hourly.weather_code?.[i])}</div>
      <div className="hidden min-w-20 flex-1 text-sm text-gray-700 sm:block">{condition(hourly.weather_code?.[i])}</div>
      <div className="w-14 text-right text-sm font-semibold text-gray-900">{val(hourly.temperature_2m?.[i])}°</div>
      <div className="w-16 text-right text-xs text-gray-500">{hourly.precipitation_probability?.[i]!=null?val(hourly.precipitation_probability[i])+"% rain":"—"}</div>
      <div className="hidden w-20 text-right text-xs text-gray-500 md:block">{hourly.wind_speed_10m?.[i]!=null?val(hourly.wind_speed_10m[i],1)+" km/h":"—"}</div>
    </div>
  </div>);

  const sidebarAir=air?.current?.us_aqi;
  const weatherMain=<>
    <div className="mb-4">
      <h1 className="text-2xl leading-tight font-bold tracking-tight text-gray-900">{title}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span>{location?.region||"Select a location"}</span><span aria-hidden="true">·</span>
        <button type="button" onClick={onSearchLocation} className="text-blue-700 hover:underline">Change location</button>
      </div>
    </div>
    {mode==="Weather Report"&&<>
      <section className="flex flex-col @container/card text-card-foreground border border-gray-200 bg-card relative isolate overflow-hidden rounded-2xl bg-clip-padding p-4 @lg/current-conditions:p-6" aria-label="Current Conditions" data-testid="current-conditions" style={{backgroundColor:"var(--color-white)"}}>
        <WeatherSprite code={current.weather_code}/>
        <div className="flex-1 relative z-10">
          <div className="flex min-h-[88px] items-end justify-between gap-4 @lg/current-conditions:min-h-30 @lg/current-conditions:gap-8">
            <div className="flex-1">
              <div className="text-sm text-gray-600">{location?.name||"Your location"}</div>
              <div className="mt-1 text-6xl leading-none font-bold tracking-tight text-gray-900">{val(current.temperature_2m)}°</div>
              <div className="mt-2 text-base font-semibold text-gray-800">{condition(current.weather_code)}</div>
            </div>
            <div className="flex min-w-16 flex-col items-center gap-1 @lg/current-conditions:gap-2">
              <div className="flex h-16 w-16 items-center justify-center @lg/current-conditions:h-[88px] @lg/current-conditions:w-[88px]"><WeatherSymbol code={current.weather_code}/></div>
              <span className="text-sm font-medium text-gray-700">{condition(current.weather_code)}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex min-h-[21px] flex-wrap items-center gap-3 @lg/current-conditions:min-h-6" data-testid="current-conditions-temperatures">
              <span className="text-sm font-semibold text-gray-900">H: {val(daily.temperature_2m_max?.[0])}°</span><span aria-hidden="true" className="h-4 w-px bg-white opacity-90"/><span className="text-sm font-semibold text-gray-900">L: {val(daily.temperature_2m_min?.[0])}°</span><span aria-hidden="true" className="h-4 w-px bg-white opacity-90"/><span className="text-sm font-semibold text-gray-900">Feels like {val(current.apparent_temperature)}°</span>
            </div>
            <div className="flex min-h-[21px] flex-wrap items-center gap-3 @lg/current-conditions:min-h-6">
              <span className="text-sm font-medium text-gray-800">Wind {val(current.wind_speed_10m,1)} km/h</span><span className="text-sm font-medium text-gray-800">Humidity {val(current.relative_humidity_2m)}%</span><span className="text-sm font-medium text-gray-800">Rain {val(current.precipitation,1)} mm</span>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-7 space-y-2">
        <h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">Today's Outlook</h2>
        {forecastLoading&&!forecast&&<div className="h-4 max-w-120 animate-pulse rounded-3xl bg-gray-200"/>}
        {forecastError&&!forecast&&<p className="text-sm text-gray-500">{forecastError}</p>}
        {forecast&&<ForecastChart times={hourTimes} temperatures={hourly.temperature_2m||[]}/>}
        {forecast&&<div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">{hourTimes.slice(0,8).map((t,i)=><div key={String(t)+i} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-2"><span className="text-xs text-gray-500">{i===0?"Now":weatherTime(t)}</span><span className="text-xl">{weatherIcon(hourly.weather_code?.[i])}</span><strong className="text-base text-gray-900">{val(hourly.temperature_2m?.[i])}°</strong></div>)}</div>}
      </div>

      <section className="mt-7 flex flex-col @container/card text-card-foreground overflow-hidden border-0 p-4 @container/currentDetails rounded-2xl bg-gray-100" aria-label="Weather Today in" data-testid="current-details">
        <div className="flex-1 p-0"><h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-3 font-black">Weather Today in {location?.name||"your area"}</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-0">
            {[
              ["Wind",val(current.wind_speed_10m,1)+" km/h","Wind speed"],
              ["Humidity",val(current.relative_humidity_2m)+"%","Relative humidity"],
              ["Dew Point",val(hourly.dew_point_2m?.[0])+"°","Available when supplied by provider"],
              ["Pressure",val(current.pressure_msl)+" hPa","Mean sea-level pressure"],
              ["UV Index",val(hourly.uv_index?.[0],1),"Hourly provider value"],
              ["Visibility",typeof hourly.visibility?.[0]==="number"?val(hourly.visibility[0]/1000,1)+" km":"—","Provider visibility estimate"]
            ].map(([label,value,detail])=><div key={label} className="flex flex-row items-center gap-2 border-t py-3 first:border-none @max-sm:flex-wrap [&:nth-child(-n+2)]:border-none [&:nth-child(-n+2)]:pt-0 [&:nth-last-child(-n+2)]:pb-0">
              <span className="inline-block text-gray-900 size-4 @md/currentDetails:size-5"><NavGlyph kind={label==="Wind"?"forecast":label==="Humidity"?"air":"clock"}/></span>
              <div className="flex flex-col min-w-0"><span className="text-sm leading-loose tracking-tight text-gray-900 grow-1 font-normal whitespace-nowrap">{label}</span><strong className="text-base font-semibold text-gray-900">{value}</strong><small className="text-xs text-gray-500">{detail}</small></div>
            </div>)}
          </div>
        </div>
      </section>

      <section className="mt-7 flex flex-col @container/card text-card-foreground bg-card border-gray-500 not-prose @container/daily order-0" aria-label={(location?.name||"Local")+" Daily Forecast"} data-testid="daily-forecast">
        <div className="flex flex-col gap-2 mb-4"><div className="flex min-h-7 items-center"><h2 className="text-xl leading-normal tracking-tight text-gray-900 font-bold">{location?.name||"Local"} Daily Forecast</h2></div></div>
        <div className="flex-1 p-0">
          <div>{forecastLoading&&!forecast&&Array.from({length:7},(_,i)=><div className="border-grey-500 @container/dailyItem overflow-hidden max-sm:border-b" key={i}><div className="flex h-14 items-center gap-3 @lg/dailyItem:gap-2 @lg/dailyItem:px-3"><span className="square inline-block animate-pulse rounded bg-gray-200 h-6 w-full"/></div></div>)}
            {forecast&&renderDailyRows(7)}
          </div>
          <div className="pt-6"><button type="button" onClick={()=>onNavigate("10 Day")} className="rounded-lg cursor-pointer bg-brand-400 text-primary-foreground hover:bg-[#252C3F] active:bg-[#0C1226] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 h-10 px-4 py-3 inline-flex items-center justify-center">Next 10 Days</button></div>
        </div>
      </section>

      <div className="mt-7"><RadarMap radar={radar} location={location} playing={radarPlaying} onPlayingChange={setRadarPlaying}/>{radarError&&<p className="mt-2 text-xs text-gray-500">{radarError}</p>}</div>
      <section className="mt-7" aria-label="Storm event reports"><div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-black text-gray-900">Storm & Event Reports</h2><button className="text-sm font-semibold text-blue-700" onClick={()=>onNavigate("Storm reports")}>View all</button></div>
        {storms.length>0?<div className="space-y-3">{storms.slice(0,3).map(s=><article key={s.id} className="rounded-xl border border-gray-200 bg-white p-4"><strong className="text-sm text-gray-900">{s.title}</strong><p className="mt-1 text-sm text-gray-600">{s.description||"Curated event from NASA EONET."}</p>{s.link&&<a href={s.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-blue-700">Source ↗</a>}</article>)}</div>:<div className="h-20 rounded-xl border border-gray-200 bg-white"/>}
      </section>
    </>}

    {mode==="Hourly"&&<section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 not-prose @container/hourly" aria-label={(location?.name||"Local")+" hourly forecast"} data-testid="hourly-forecast">
      <h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">{location?.name||"Local"} Hourly Forecast</h2>
      {forecastLoading&&!forecast&&<div className="h-48 animate-pulse rounded-3xl bg-gray-200"/>}
      {forecastError&&!forecast&&<p className="py-6 text-sm text-gray-500">{forecastError}</p>}
      {forecast&&<><ForecastChart times={hourTimes} temperatures={hourly.temperature_2m||[]}/><div className="mt-5">{renderHourlyRows()}</div></>}
    </section>}

    {mode==="10 Day"&&<section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 not-prose @container/daily order-0" aria-label={(location?.name||"Local")+" Daily Forecast"} data-testid="daily-forecast">
      <h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">{location?.name||"Local"} Daily Forecast</h2>
      <p className="mb-4 text-sm text-gray-600">{location?.region||""} · Day · Conditions · Temperature · Wind</p>
      {forecastLoading&&!forecast&&Array.from({length:7},(_,i)=><div className="border-grey-500 @container/dailyItem overflow-hidden max-sm:border-b" key={i}><div className="flex h-14 items-center gap-3 @lg/dailyItem:gap-2 @lg/dailyItem:px-3"><span className="square inline-block animate-pulse rounded bg-gray-200 h-6 w-full"/></div></div>)}
      {forecast&&renderDailyRows(10)}
    </section>}

    {mode==="Radar"&&<RadarMap radar={radar} location={location} playing={radarPlaying} onPlayingChange={setRadarPlaying}/>}
    {mode==="Air Quality"&&<section className="flex flex-col @container/card text-card-foreground bg-card mb-6 gap-0 border-b border-[#676767] pb-6" data-testid="AirQualityCard">
      <h2 className="text-2xl leading-tight font-bold tracking-tight text-gray-900">{location?.name||"Local"} Air Quality</h2>
      <p className="mb-4 text-sm text-gray-500">{location?.region||""}</p>
      {airLoading&&!air&&<div className="h-36 animate-pulse rounded-2xl bg-gray-100"/>}
      {airError&&!air&&<div className="py-8 text-sm text-gray-500">{airError}</div>}
      {air?.current&&<><div className="flex flex-wrap pb-[26px] @2xl/card:flex-nowrap gap-6">
        <div className="flex w-full items-center gap-4 @2xl/card:w-1/2">
          <div className="flex h-40 w-40 items-center justify-center rounded-full border-[14px]" style={{borderColor:typeof air.current.us_aqi==="number"?aqiColor(air.current.us_aqi):"#ddd"}}>
            <div className="text-center"><strong className="block text-5xl font-bold text-gray-900">{val(air.current.us_aqi)}</strong><span className="text-xs text-gray-500">US AQI</span></div>
          </div>
          <div><strong className="block text-2xl font-bold text-gray-900">{typeof air.current.us_aqi==="number"?aqiLabel(air.current.us_aqi):"—"}</strong><span className="text-sm text-gray-500">Model estimate</span></div>
        </div>
        <div className="flex-1 self-center text-sm leading-relaxed text-gray-600">The air-quality index is model guidance based on CAMS atmospheric composition. It is not an official Indian CPCB station measurement.</div>
      </div>
      <section aria-label="All pollutants" data-testid="AirQuality-AllPollutants" className="flex flex-wrap justify-between gap-3">
        {[
          ["PM2.5",air.current.pm2_5],["PM10",air.current.pm10],["Ozone",air.current.ozone],
          ["Nitrogen dioxide",air.current.nitrogen_dioxide],["Sulphur dioxide",air.current.sulphur_dioxide],["Carbon monoxide",air.current.carbon_monoxide]
        ].map(([label,value])=><article key={String(label)} className="min-w-[120px] flex-1 rounded-xl bg-gray-100 p-4"><span className="block text-sm text-gray-600">{label}</span><strong className="mt-2 block text-xl text-gray-900">{val(value,1)}</strong><small className="text-xs text-gray-500">μg/m³</small></article>)}
      </section>
      <p className="mt-4 text-xs leading-relaxed text-gray-500">{air.note||"CAMS modelled guidance, not a ground monitor observation."} · Nominal resolution {air.source?.resolution_km||45} km.</p>
      </>}
    </section>}

    {mode==="Allergy"&&<section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500" data-testid="PollenBreakdownModule" aria-label={(location?.name||"Local")+" pollen breakdown"}>
      <h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">{location?.name||"Local"} Pollen Breakdown</h2>
      <div className="min-h-48"/>
    </section>}
    {mode==="Cold & Flu"&&<section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500" data-testid="ColdFluModule" aria-label="Cold and flu"><h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">Cold & Flu</h2><div className="min-h-48"/></section>}
    {mode==="Storm reports"&&<section className="space-y-3" aria-label="Storm reports"><h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">Storm & Event Reports</h2>{storms.map(s=><article key={s.id} className="rounded-xl border border-gray-200 bg-white p-4"><h3 className="font-semibold text-gray-900">{s.title}</h3><p className="text-sm text-gray-600">{s.description}</p>{s.link&&<a href={s.link} target="_blank" rel="noreferrer" className="text-sm text-blue-700">Source ↗</a>}</article>)}</section>}
  </>;

  const mainPage=<div className="relative w-full md:mx-4 md:w-[calc(100%-32px)] md:overflow-hidden md:rounded-3xl">
    <div className="w-full grid mx-auto gap-6 p-4 max-w-8xl [grid-template-columns:minmax(0,1fr)] [grid-template-areas:'contentTop'_'main'_'sidebar'_'contentBottom'] md:[grid-template-columns:minmax(0,1fr)_minmax(0,340px)] md:[grid-template-areas:'contentTop_contentTop'_'main_sidebar'_'contentBottom_contentBottom']">
      <div style={{gridArea:"contentTop"}}><AdSlot height="min-h-[250px]" className="pb-0"/></div>
      <div style={{gridArea:"main"}}>{weatherMain}</div>
      <aside style={{gridArea:"sidebar"}} className="flex flex-col gap-6">
        <AdSlot height="min-h-[280px]"/>
        <section className="bg-card flex flex-col gap-4" aria-label="Air Quality Index" data-testid="AirQualityIndex">
          <h2 className="text-xl leading-normal tracking-tight text-gray-900 font-bold">Air Quality Index</h2>
          {typeof sidebarAir==="number"?<div className="flex items-center gap-4 rounded-2xl border border-gray-200 p-4"><div className="flex h-20 w-20 items-center justify-center rounded-full border-[9px]" style={{borderColor:aqiColor(sidebarAir)}}><strong className="text-2xl text-gray-900">{Math.round(sidebarAir)}</strong></div><div><strong className="block text-base text-gray-900">{aqiLabel(sidebarAir)}</strong><span className="text-xs text-gray-500">Model guidance</span></div></div>:<div className="min-h-24 rounded-xl bg-gray-100"/>}
        </section>
        <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500" aria-label="Health and Activities" data-testid="HealthAndActivitiesModule"><h2 className="text-xl leading-normal tracking-tight text-gray-900 font-bold">Health & Activities</h2><div className="min-h-36"/></section>
        <AdSlot height="min-h-[250px]" className="pb-6"/>
      </aside>
      <div style={{gridArea:"contentBottom"}} className="pt-2"><p className="text-xs leading-relaxed text-gray-400">Forecasts are numerical model guidance. Availability, timing and update frequency depend on each provider. Air-quality values are modelled CAMS estimates, not official ground-station readings.</p></div>
    </div>
  </div>;

  return mainPage;
}
