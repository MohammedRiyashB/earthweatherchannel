import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "https://earthweather-api.onrender.com";

export type WeatherChannelMode =
  | "Weather Report" | "Hourly" | "10 Day" | "Radar"
  | "Air Quality" | "Allergy" | "Storm reports";

export type WeatherChannelLocation = {
  name: string;
  region: string;
  lat: number;
  lon: number;
  current?: Record<string, any>;
} | null;

type City = { name: string; region?: string; current?: Record<string, any> };
type Storm = {
  id: string; title: string; description?: string; link?: string;
  coordinates?: { lat: number; lon: number; date?: string }[];
};
type Forecast = {
  current?: Record<string, any>;
  hourly?: Record<string, any[]>;
  daily?: Record<string, any[]>;
  source?: { name?: string; provider?: string; url?: string };
};
type AirQuality = { current?: Record<string, any>; source?: { name?: string; resolution_km?: number }; note?: string };
type Radar = { host?: string; frames?: { time: number; path: string }[]; note?: string };

function Icon({ name, className = "size-6" }: {
  name: "menu" | "forecast" | "radar" | "allergy" | "air" | "more" | "user" | "pin" | "search" | "chevron";
  className?: string;
}) {
  const paths: Record<string, ReactNode> = {
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    forecast: <><path d="M20 16.5a4.5 4.5 0 0 0-1.4-8.78A6.5 6.5 0 0 0 6 9.5 4 4 0 0 0 6 17h14Z"/><path d="M8 20h8"/></>,
    radar: <><circle cx="12" cy="12" r="9"/><path d="M12 12 18.5 7.5M12 12l2-7"/><path d="M7.5 16.5a6 6 0 0 0 8.2-.1"/></>,
    allergy: <><path d="M12 22V11"/><path d="M12 14c-4 0-7-3-7-7 4 0 7 3 7 7Z"/><path d="M12 11c0-4 3-7 7-7 0 4-3 7-7 7Z"/><path d="M7 21h10"/></>,
    air: <><path d="M3 8h12a3 3 0 1 0-3-3"/><path d="M2 12h17a2.5 2.5 0 1 1-2.5 2.5"/><path d="M4 17h8a2 2 0 1 1-2 2"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.1 4.1"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>
  };
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function weatherKind(code: unknown) {
  return code === 0 ? "sun" : code === 1 || code === 2 ? "partly"
    : code === 3 ? "cloud"
    : typeof code === "number" && [45,48].includes(code) ? "fog"
    : typeof code === "number" && [95,96,99].includes(code) ? "storm"
    : typeof code === "number" && [71,73,75,77,85,86].includes(code) ? "snow"
    : typeof code === "number" && [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code) ? "rain" : "cloud";
}

function WeatherGlyph({ code, className = "" }: { code: unknown; className?: string }) {
  const name = weatherKind(code);
  return <span className={"wx-icon-weather "+className} data-weather={name} aria-label={weatherLabel(code)}>
    {name === "sun" ? "☀" : name === "partly" ? "🌤" : name === "cloud" ? "☁" : name === "fog" ? "🌫" : name === "storm" ? "⛈" : name === "snow" ? "❄" : "🌧"}
  </span>;
}

/* Lightweight Pixi-style weather particle field rendered on a transparent canvas. */
function WeatherParticleField({ code }: { code: unknown }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = weatherKind(code);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !ctx) return;
    let width = 0, height = 0, raf = 0, lastFrame = 0, lastTime = 0;
    let flashUntil = 0, nextFlash = 5000 + Math.random() * 5000;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
    const rainCount = scene === "storm" ? 90 : 62;
    const snowCount = 42;
    const particles = Array.from({ length: scene === "rain" || scene === "storm" ? rainCount : scene === "snow" ? snowCount : 22 }, () => ({
      x: Math.random(), y: Math.random(), speed: 0.55 + Math.random() * 1.1,
      size: 1.2 + Math.random() * 2.2, length: 8 + Math.random() * 15,
      phase: Math.random() * Math.PI * 2, drift: .3 + Math.random() * .8
    }));
    const clouds = Array.from({ length: scene === "cloud" || scene === "partly" || scene === "storm" ? 5 : 2 }, (_, i) => ({
      x: (i * .27 + Math.random() * .12) % 1, y: .16 + Math.random() * .48,
      scale: .55 + Math.random() * .75, speed: .003 + Math.random() * .006,
      alpha: .12 + Math.random() * .16
    }));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (time: number) => {
      if (document.hidden) { raf = requestAnimationFrame(draw); return; }
      if (time - lastFrame < 30 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        raf = requestAnimationFrame(draw); return;
      }
      const dt = Math.min((time - (lastTime || time)) / 16.67, 2);
      lastTime = time; lastFrame = time;
      ctx.clearRect(0, 0, width, height);
      if (scene === "sun" || scene === "partly") {
        const sx = width * .77, sy = height * .25, radius = Math.min(width, height) * .34;
        const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, radius);
        glow.addColorStop(0, "rgba(255,226,145,.28)");
        glow.addColorStop(1, "rgba(255,226,145,0)");
        ctx.fillStyle = glow; ctx.fillRect(sx-radius, sy-radius, radius*2, radius*2);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(time * .000035);
        ctx.strokeStyle = "rgba(255,235,173,.28)"; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, radius*.42); ctx.lineTo(0, radius*.54); ctx.stroke();
        }
        ctx.restore();
      }
      if (clouds.length && (scene === "cloud" || scene === "partly" || scene === "storm" || scene === "fog")) {
        clouds.forEach((cloud) => {
          cloud.x += cloud.speed * dt;
          if (cloud.x > 1.18) cloud.x = -.2;
          const x = cloud.x * width, y = cloud.y * height, s = cloud.scale;
          ctx.save(); ctx.globalAlpha = cloud.alpha;
          const cloudGradient = ctx.createRadialGradient(x, y, 3, x, y, 76*s);
          cloudGradient.addColorStop(0, "rgba(238,247,255,.65)");
          cloudGradient.addColorStop(1, "rgba(220,239,255,0)");
          ctx.fillStyle = cloudGradient;
          ctx.beginPath(); ctx.ellipse(x, y, 78*s, 27*s, 0, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(x-25*s, y-10*s, 31*s, 22*s, 0, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(x+20*s, y-15*s, 38*s, 28*s, 0, 0, Math.PI*2); ctx.fill();
          ctx.restore();
        });
      }
      if (scene === "rain" || scene === "storm") {
        ctx.lineWidth = scene === "storm" ? 1.7 : 1.25;
        particles.forEach((p) => {
          p.x -= .0035 * p.speed * dt; p.y += .012 * p.speed * dt;
          if (p.y > 1.08) { p.y = -.08; p.x = Math.random() * 1.08; }
          if (p.x < -.08) p.x = 1.04;
          const x = p.x * width, y = p.y * height;
          ctx.strokeStyle = scene === "storm" ? "rgba(208,231,255,.62)" : "rgba(189,225,255,.52)";
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x-3.5, y+p.length); ctx.stroke();
        });
      } else if (scene === "snow") {
        particles.forEach((p) => {
          p.y += .0022 * p.speed * dt;
          p.x += Math.sin(time*.0007 + p.phase) * .0018 * dt;
          if (p.y > 1.06) { p.y = -.05; p.x = Math.random(); }
          if (p.x < -.03) p.x = 1.03; if (p.x > 1.03) p.x = -.03;
          ctx.fillStyle = "rgba(244,250,255,.8)";
          ctx.beginPath(); ctx.arc(p.x*width, p.y*height, p.size, 0, Math.PI*2); ctx.fill();
        });
      } else if (scene === "fog") {
        for (let i = 0; i < 5; i++) {
          const x = ((time*.008 + i*width*.28) % (width*1.6)) - width*.3;
          const y = height*(.32 + i*.12);
          ctx.fillStyle = "rgba(234,244,250,.065)";
          ctx.beginPath(); ctx.ellipse(x, y, width*.34, 12+i*2, 0, 0, Math.PI*2); ctx.fill();
        }
      }
      if (scene === "storm") {
        if (time > nextFlash) { flashUntil = time + 150; nextFlash = time + 4800 + Math.random()*6500; }
        if (time < flashUntil) {
          ctx.fillStyle = "rgba(222,235,255,.12)"; ctx.fillRect(0,0,width,height);
          ctx.strokeStyle = "rgba(250,252,255,.9)"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(width*.68,height*.16); ctx.lineTo(width*.64,height*.32);
          ctx.lineTo(width*.70,height*.32); ctx.lineTo(width*.62,height*.52); ctx.stroke();
        }
      }
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(draw);
    };
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [scene]);
  return <canvas ref={canvasRef} className="wx-hero-particles" aria-hidden="true"/>;
}

function weatherLabel(code: unknown) {
  if (typeof code !== "number") return "Conditions unavailable";
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45,48].includes(code)) return "Fog";
  if ([51,53,55,56,57].includes(code)) return "Drizzle";
  if ([61,63,65,66,67,80,81,82].includes(code)) return "Rain";
  if ([71,73,75,77,85,86].includes(code)) return "Snow";
  if ([95,96,99].includes(code)) return "Thunderstorms";
  return "Variable conditions";
}
const value = (n: unknown, digits = 0) =>
  typeof n === "number" && Number.isFinite(n) ? Number(n.toFixed(digits)).toString() : "—";
const clock = (v: unknown) => {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const dateLabel = (v: unknown) => {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v.length === 10 ? v + "T12:00:00" : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};
const aqiText = (n: number) => n <= 50 ? "Good" : n <= 100 ? "Moderate" : n <= 150 ? "Unhealthy for sensitive groups" : n <= 200 ? "Unhealthy" : n <= 300 ? "Very unhealthy" : "Hazardous";

export function WeatherChannelLayout({
  active, location, onNavigate, onSearchLocation, onAccount, accountName, children
}: {
  active: string;
  location: WeatherChannelLocation;
  onNavigate: (page: string) => void;
  onSearchLocation: () => void;
  onAccount: () => void;
  accountName?: string | null;
  children: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);



  const navItems = [
    { key: "Weather Report", label: "Forecasts", icon: "forecast" as const },
    { key: "Radar", label: "Radar", icon: "radar" as const },
    { key: "Allergy", label: "Allergy Tracker", icon: "allergy" as const },
    { key: "Air Quality", label: "Air Quality Index", icon: "air" as const }
  ];
  const moreItems = [
    ["Hourly", "Hourly forecast"], ["10 Day", "10-day forecast"],
    ["Satellite imagery", "Satellite"], ["Satellite Report", "Satellite report"],
    ["Storm reports", "Storm reports"], ["World", "World weather news"],
    ["Country", "Country weather news"], ["State", "State weather news"], ["Local", "Local weather news"]
  ];
  const nav = (drawer = false) => <nav
    aria-label="Weather navigation"
    data-component="sidebar-navigation"
    className={drawer
      ? "flex h-full w-full flex-col gap-8 bg-white pt-8"
      : "relative top-0 box-content flex h-screen w-20 flex-col gap-8 leading-none transition-colors duration-200 max-xl:items-center bg-white xl:w-[200px]"}
  >
    <div className="mb-0 flex flex-wrap items-center justify-center gap-4 pt-4 leading-none xl:px-4 xl:justify-start">
      <button type="button" onClick={() => onNavigate("Weather Report")} className="flex items-center justify-center" aria-label="EARTH WEATHER home">
        <img src="/logo.png" alt="EARTH WEATHER" className="h-10 w-auto max-w-[160px] object-contain xl:h-12" />
      </button>
    </div>
    <ul className="m-0 flex w-full flex-col gap-1 px-3">
      {navItems.map(item => <li key={item.key}>
        <button type="button" onClick={() => { onNavigate(item.key); setMobileOpen(false); }}
          className={"group relative box-border flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-2xl px-3 font-semibold text-gray-900 no-underline transition-[color,background-color,border-color,width,height,padding] duration-200 hover:bg-gray-100 focus-visible:bg-gray-100 xl:h-12 xl:flex-row xl:justify-start " + (active === item.key ? "bg-gray-100 text-[#003399]" : "")}>
          <Icon name={item.icon} className="inline-block h-6 w-6 shrink-0 text-[#003399] xl:mr-3" />
          <span className="tracking-tight line-clamp-1 text-xxs mt-1 h-[13px] pb-0 font-semibold text-inherit transition-opacity duration-200 xl:mt-0 xl:h-auto xl:text-sm">{item.label}</span>
        </button>
      </li>)}
      <li className="relative">
        <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)}
          className={"group relative box-border flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-2xl px-3 font-semibold text-gray-900 xl:h-12 xl:flex-row xl:justify-start " + (moreOpen ? "bg-gray-100" : "hover:bg-gray-100")}>
          <Icon name="more" className="inline-block h-6 w-6 shrink-0 xl:mr-3" />
          <span className="mt-1 text-xxs font-semibold xl:mt-0 xl:text-sm">More</span>
        </button>
        {moreOpen && <div className="absolute left-full top-0 z-50 ml-2 flex min-w-52 flex-col rounded-2xl border border-gray-200 bg-white p-2 shadow-xl max-xl:left-0 max-xl:top-full max-xl:ml-0">
          {moreItems.map(([key, title]) => <button key={key} type="button"
            onClick={() => { onNavigate(key); setMoreOpen(false); setMobileOpen(false); }}
            className={"rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-100 " + (active === key ? "bg-gray-100 font-bold text-[#003399]" : "")}>{title}</button>)}
        </div>}
      </li>
    </ul>
    <ul className="m-0 mt-auto flex w-full flex-col gap-1 px-3 pb-4">
      <li><button type="button" onClick={onAccount}
        className="group relative box-border flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-[#252422] px-3 font-semibold text-white xl:h-12 xl:flex-row xl:justify-start">
        <Icon name="user" className="inline-block h-6 w-6 shrink-0 text-white xl:mr-3" />
        <span className="mt-1 line-clamp-1 text-xxs font-semibold text-white xl:mt-0 xl:text-sm">{accountName || "Sign in"}</span>
      </button></li>
    </ul>
  </nav>;

  return <div className="wx-weather-site min-h-screen bg-white text-gray-900">
    <div className="flex items-start">
      <div className="z-nav sticky top-0 hidden shrink-0 md:block">{nav(false)}</div>
      {mobileOpen && <div className="wx-mobile-menu-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setMobileOpen(false); }}>
        <div className="wx-mobile-drawer">
          <button className="wx-drawer-close" type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)}>×</button>
          {nav(true)}
        </div>
      </div>}
      <main id="main-content-wrapper" className="min-w-0 shrink grow md:pl-8">
        <header className="relative top-0 z-50 w-full bg-white md:sticky">
          <div className="text-black max-md:bg-white" data-component="header-main" data-testid="header-main">
            <div className="mx-auto flex items-center justify-between gap-2 px-3 py-2 md:gap-4 md:py-3 md:pl-0">
              <span className="contents md:hidden">
                <button type="button" aria-label="Menu" onClick={() => setMobileOpen(true)}
                  className="inline-flex h-10 w-10 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg p-0 hover:bg-gray-100 active:bg-gray-200">
                  <Icon name="menu" className="inline-block h-6 w-6 text-gray-900" />
                </button>
              </span>
              <div className="flex items-center md:hidden">
                <button type="button" className="flex items-center md:hidden" onClick={() => onNavigate("Weather Report")} aria-label="EARTH WEATHER home">
                  <img src="/logo.png" alt="EARTH WEATHER" className="wx-mobile-brand-logo object-contain" />
                </button>
              </div>
              <div className="relative hidden md:block">
                <div className="rounded-4xl bg-white md:p-1 md:shadow-[0_4px_16px_0_rgba(0,0,0,0.08),_0_0_32px_0_rgba(0,0,0,0.12)]">
                  <button type="button" onClick={onSearchLocation} aria-label="Search weather location"
                    className="inline-flex h-10 max-w-[190px] cursor-pointer items-center justify-center gap-2 rounded-3xl bg-[#252422] px-3 py-0 text-sm font-bold text-white transition-colors hover:bg-[#3A3938] active:bg-[#0C0B0B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:h-12 md:max-w-[240px] md:bg-gray-100 md:text-gray-900 md:hover:bg-gray-200 md:px-4">
                    <Icon name="pin" className="size-5 shrink-0"/>
                    <span className="max-w-[140px] truncate text-left md:max-w-[180px]"><span className="block truncate">{location?.name || "Choose location"}</span><small className="hidden text-xs font-normal text-gray-500 md:block">{location?.region || "Weather in your area"}</small></span>
                    <Icon name="chevron" className="size-4 shrink-0"/>
                  </button>
                </div>
              </div>
              <div className="hidden items-center md:flex">
                <div className="flex h-12 items-center gap-1 rounded-3xl bg-white p-1 shadow-[0_4px_16px_0_rgba(0,0,0,0.08),_0_0_32px_0_rgba(0,0,0,0.12)]" aria-label="Forecast tabs">
                  {(["Weather Report", "Hourly", "10 Day"] as const).map((key, index) => <button key={key} type="button" onClick={() => onNavigate(key)}
                    className={"inline-flex h-full items-center rounded-3xl px-4 text-sm font-bold transition-colors hover:bg-gray-100 " + (active === key ? "bg-gray-100 text-[#003399]" : "text-gray-900")}>{["Today", "Hourly", "10 Day"][index]}</button>)}
                </div>
              </div>
              <div className="flex shrink-0 items-center md:hidden">
                <button type="button" onClick={onAccount} className="h-10 rounded-xl bg-[#252422] px-4 text-sm font-bold text-white">{accountName || "Sign in"}</button>
              </div>
            </div>
          </div>
        </header>

        <div className="wx-mobile-location-sticky md:hidden" data-testid="mobile-sticky-location">
          <div className="wx-mobile-location-surface">
            <button type="button" onClick={onSearchLocation} aria-label="Search weather location"
              className="wx-mobile-location-button">
              <Icon name="pin" className="size-5 shrink-0"/>
              <span className="min-w-0 truncate">{location?.name || "Choose location"}</span>
              <Icon name="chevron" className="size-4 shrink-0"/>
            </button>
          </div>
        </div>

        {children}
      </main>
    </div>
  </div>;
}

function WeatherSprite({ code }: { code: unknown }) {
  const positions: Record<string, string> = { clear: "44.4631% 99.7619%", cloud: "44.4631% 99.7619%", rain: "55% 80%", snow: "66% 80%", storm: "77% 80%", fog: "88% 80%" };
  const kind = code === 0 ? "clear" : typeof code === "number" && [61,63,65,66,67,80,81,82,95,96,99].includes(code) ? "rain"
    : typeof code === "number" && [71,73,75,77,85,86].includes(code) ? "snow"
    : typeof code === "number" && [45,48].includes(code) ? "fog" : "cloud";
  const spriteSet = 'image-set(url("/_next/static/immutable/media/weather-bg-sprite.2ol3vhh5gt8dk.webp") type("image/webp"), url("/_next/static/immutable/media/weather-bg-sprite.32wix_aaq3qmi.jpg") type("image/jpeg"))';
  const style = {
    backgroundImage: spriteSet,
    backgroundRepeat: "no-repeat",
    backgroundSize: "1031.25% 1266.6667%",
    backgroundPosition: positions[kind],
    "--wx-sprite-set": spriteSet
  } as CSSProperties;
  return <div className="WeatherSprite-module__Z3SuQq__sprite absolute inset-0" style={style} aria-hidden="true"/>;
}

export function WeatherChannelPage({ mode, location, cities, storms, onNavigate }: {
  mode: WeatherChannelMode;
  location: WeatherChannelLocation;
  cities: City[];
  storms: Storm[];
  onNavigate: (page: string) => void;
}) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");
  const [air, setAir] = useState<AirQuality | null>(null);
  const [airLoading, setAirLoading] = useState(false);
  const [airError, setAirError] = useState("");
  const [radar, setRadar] = useState<Radar | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState("");
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [zoom, setZoom] = useState(5);

  useEffect(() => {
    if (!location) { setForecast(null); setForecastError("Choose a location to load the forecast."); return; }
    const controller = new AbortController();
    setForecastLoading(true); setForecastError("");
    const params = new URLSearchParams({ latitude: String(location.lat), longitude: String(location.lon), days: "10", timezone: "auto" });
    fetch(API + "/api/forecast?" + params.toString(), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Forecast service returned " + response.status);
        return response.json() as Promise<Forecast>;
      }).then(setForecast)
      .catch(error => { if (!controller.signal.aborted) setForecastError(error instanceof Error ? error.message : "Forecast unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setForecastLoading(false); });
    return () => controller.abort();
  }, [location?.lat, location?.lon, refresh]);

  useEffect(() => {
    if (!location || !["Weather Report", "Hourly", "10 Day", "Air Quality"].includes(mode)) return;
    const controller = new AbortController();
    setAirLoading(true); setAirError("");
    const params = new URLSearchParams({ latitude: String(location.lat), longitude: String(location.lon), days: "5" });
    fetch(API + "/api/air-quality?" + params.toString(), { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Air-quality service returned " + response.status); return response.json() as Promise<AirQuality>; })
      .then(setAir)
      .catch(error => { if (!controller.signal.aborted) setAirError(error instanceof Error ? error.message : "Air quality unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setAirLoading(false); });
    return () => controller.abort();
  }, [mode, location?.lat, location?.lon, refresh]);

  useEffect(() => {
    if (!["Weather Report", "Radar", "Hourly", "10 Day"].includes(mode)) return;
    let active = true;
    const load = async () => {
      setRadarLoading(true);
      try {
        const response = await fetch(API + "/api/radar", { cache: "no-store" });
        if (!response.ok) throw new Error("Radar service returned " + response.status);
        const payload = await response.json() as Radar;
        if (active) { setRadar(payload); setFrameIndex(Math.max(0, (payload.frames?.length || 1) - 1)); setRadarError(""); }
      } catch (error) { if (active) setRadarError(error instanceof Error ? error.message : "Radar unavailable"); }
      finally { if (active) setRadarLoading(false); }
    };
    void load();
    const interval = window.setInterval(() => void load(), 10 * 60 * 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [mode, refresh]);

  const hourly = forecast?.hourly || {};
  const daily = forecast?.daily || {};
  const current = location?.current || forecast?.current || {};
  const hours = (hourly.time || []).slice(0, 24);
  const days = (daily.time || []).slice(0, 10);
  const frames = radar?.frames || [];
  const frame = frames[frameIndex] || frames[frames.length - 1];
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex(i => (i + 1) % frames.length), 1100);
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  const tiles = useMemo(() => {
    if (!location) return [];
    const n = 2 ** zoom;
    const lat = Math.max(-85.0511, Math.min(85.0511, location.lat)) * Math.PI / 180;
    const cx = Math.floor((location.lon + 180) / 360 * n);
    const cy = Math.floor((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * n);
    const result: {x:number;y:number;key:string}[] = [];
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
      const x = ((cx+dx)%n+n)%n, y=cy+dy;
      if (y>=0&&y<n) result.push({x,y,key:zoom+"-"+x+"-"+y});
    }
    return result;
  }, [location?.lat, location?.lon, zoom]);

  const provider = forecast?.source?.name || forecast?.source?.provider || "Configured forecast provider";
  const aqi = typeof air?.current?.us_aqi === "number" ? Math.round(air.current.us_aqi) : null;
  const high = daily.temperature_2m_max?.[0], low = daily.temperature_2m_min?.[0];
  const rainChance = hourly.precipitation_probability?.[0] ?? daily.precipitation_probability_max?.[0];
  const details = [
    ["Wind", value(current.wind_speed_10m,1) + " km/h", "↗"],
    ["Humidity", value(current.relative_humidity_2m) + "%", "◌"],
    ["Air Quality", aqi == null ? "—" : String(aqi), "◉"],
    ["Dew Point", value(current.dew_point_2m) + "°", "◍"],
    ["Pressure", value(current.pressure_msl,1) + " hPa", "⌁"],
    ["UV Index", value(hourly.uv_index?.[0]), "☼"],
    ["Visibility", typeof hourly.visibility?.[0] === "number" ? value(hourly.visibility[0]/1000,1)+" km" : "—", "◎"],
    ["Moon Phase", "—", "◐"],
    ["Sunrise", daily.sunrise?.[0] ? clock(daily.sunrise[0]) : "—", "↑"],
    ["Sunset", daily.sunset?.[0] ? clock(daily.sunset[0]) : "—", "↓"]
  ];

  const hourlyCards = hours.slice(0,12).map((time,index) => <div className="flex min-w-[74px] flex-col items-center gap-2 rounded-xl px-2 py-3 text-center hover:bg-gray-100" key={String(time)+index}>
    <span className="text-xs font-semibold text-gray-600">{index===0?"Now":clock(time)}</span>
    <WeatherGlyph code={hourly.weather_code?.[index]} className="text-3xl"/>
    <strong className="text-xl font-bold text-gray-900">{value(hourly.temperature_2m?.[index])}°</strong>
    <small className="text-xs text-gray-500">{hourly.precipitation_probability?.[index]!=null?value(hourly.precipitation_probability[index])+"%":"—"}</small>
  </div>);

  const lowValues = (daily.temperature_2m_min || []).filter((n: unknown): n is number => typeof n === "number" && Number.isFinite(n));
  const highValues = (daily.temperature_2m_max || []).filter((n: unknown): n is number => typeof n === "number" && Number.isFinite(n));
  const overallLow = lowValues.length ? Math.min(...lowValues) : 0;
  const overallHigh = highValues.length ? Math.max(...highValues) : overallLow + 1;
  const temperatureSpan = Math.max(1, overallHigh - overallLow);
  const forecastRows = (limit: number) => days.slice(0,limit).map((date,index) => {
    const low = daily.temperature_2m_min?.[index];
    const high = daily.temperature_2m_max?.[index];
    const probability = daily.precipitation_probability_max?.[index] ?? daily.precipitation_probability?.[index];
    const rangeLeft = typeof low === "number" ? Math.max(0, Math.min(78, ((low-overallLow)/temperatureSpan)*100)) : 0;
    const rangeWidth = typeof high === "number" && typeof low === "number"
      ? Math.max(18, Math.min(100-rangeLeft, ((high-low)/temperatureSpan)*100)) : 58;
    const dayName = index === 0 ? "Tonight" : (() => {
      const d = new Date(String(date).length === 10 ? String(date)+"T12:00:00" : String(date));
      return Number.isNaN(d.getTime()) ? dateLabel(date) : d.toLocaleDateString([], { weekday:"short", day:"2-digit" });
    })();
    return <div className="wx-daily-forecast-row" key={String(date)+index}>
      <strong className="wx-day-name">{dayName}</strong>
      <span className="wx-day-symbol"><WeatherGlyph code={daily.weather_code?.[index]} className="wx-daily-icon"/></span>
      <span className="wx-day-rain">{typeof probability === "number" ? value(probability)+"%" : "—"}</span>
      <span className="wx-day-low">{value(low)}°</span>
      <span className="wx-day-range"><i style={{left:rangeLeft+"%",width:rangeWidth+"%"}}/></span>
      <strong className="wx-day-high">{value(high)}°</strong>
    </div>;
  });

  const currentCard = <section aria-label="Current Conditions" data-testid="current-conditions"
    data-scene={weatherKind(current.weather_code)}
    className="wx-hero-card flex flex-col relative isolate overflow-hidden rounded-2xl border border-gray-200">
    <WeatherParticleField code={current.weather_code}/>
    <div className="wx-hero-content relative z-10 flex-1 text-white">
      <div className="wx-hero-main flex items-center justify-between gap-4">
        <div className="wx-hero-temperature-wrap min-w-0">
          <span className="wx-hero-now">Now</span>
          <strong className="wx-hero-temperature">{value(current.temperature_2m)}°</strong>
        </div>
        <div className="wx-hero-condition flex min-w-0 flex-col items-center">
          <WeatherGlyph code={current.weather_code} className="wx-hero-symbol"/>
          <span className="wx-hero-condition-label">{weatherLabel(current.weather_code)}</span>
        </div>
      </div>
      <div className="wx-hero-meta">
        <span><span className="wx-hero-muted">Feels like</span> <strong>{value(current.apparent_temperature)}°</strong></span>
        <i/>
        <span><span className="wx-hero-muted">H</span> <strong>{value(high)}°</strong></span>
        <i/>
        <span><span className="wx-hero-muted">L</span> <strong>{value(low)}°</strong></span>
      </div>
      <div className="wx-hero-rain">
        <span><span className="wx-hero-muted">Chance of Rain</span> <strong>{rainChance==null?"—":value(rainChance)+"%"}</strong></span>
        {current.precipitation!=null&&<><i/><strong>{value(current.precipitation,1)} mm</strong></>}
      </div>
    </div>
  </section>;

  const currentDetails = <section aria-label="Current weather details" data-testid="current-details"
    className="flex flex-col @container/card text-card-foreground overflow-hidden border-0 p-4 @container/currentDetails rounded-2xl bg-gray-100">
    <div className="flex-1 p-0"><div className="grid grid-cols-2 gap-x-8 gap-y-0">
      {details.map(([name,val,glyph])=><div key={name} className="flex flex-row items-center gap-2 border-t py-3 first:border-none @max-sm:flex-wrap [&:nth-child(-n+2)]:border-none [&:nth-child(-n+2)]:pt-0 [&:nth-last-child(-n+2)]:pb-0">
        <span aria-hidden="true" className="inline-block size-5 shrink-0 text-gray-900">{glyph}</span>
        <p className="text-base leading-loose tracking-tight text-gray-900 grow-1 font-normal whitespace-nowrap">{name}</p>
        <strong className="shrink-0 text-sm font-semibold text-gray-900">{val}</strong>
      </div>)}
    </div></div>
  </section>;

  const hourlySection = <section className="flex flex-col gap-2" aria-label="Hourly forecast">
    <div className="flex min-h-7 items-center justify-between gap-3">
      <h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">Today's outlook</h2>
      <button type="button" onClick={()=>onNavigate("Hourly")} className="text-sm font-bold text-[#003399]">Next 24 hours ›</button>
    </div>
    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 pt-4"><span className="text-sm font-semibold text-gray-900">Hourly forecast</span><span className="text-xs text-gray-500">Local time</span></div>
      <div className="flex gap-2 overflow-x-auto px-3 py-4">{hourlyCards}</div>
    </div>
  </section>;

  const dailySection = <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 not-prose @container/daily order-0" aria-label="Daily forecast">
    <div className="mb-4 flex flex-col gap-2"><div className="flex min-h-7 items-center justify-between gap-3"><h2 className="text-xl leading-normal tracking-tight font-bold text-gray-900">{location?.name||"Local"} Daily Forecast</h2>{mode!=="10 Day"&&<button type="button" onClick={()=>onNavigate("10 Day")} className="text-sm font-bold text-[#003399]">Next 10 days ›</button>}</div></div>
    <div className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-2">{forecastRows(mode==="10 Day"?10:7)}</div>
  </section>;

  const aqiCard = <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 rounded-2xl p-4" aria-label="Air Quality Index">
    <div className="flex items-center justify-between gap-2"><h2 className="text-xl leading-normal tracking-tight font-bold text-gray-900 pb-4">Air Quality Index</h2><button type="button" onClick={()=>onNavigate("Air Quality")} className="text-sm font-semibold text-[#003399]">Details</button></div>
    {airLoading&&!air&&<div className="h-20 animate-pulse rounded-xl bg-gray-100"/>}
    {airError&&!air&&<p className="text-sm text-gray-500">{airError}</p>}
    {aqi!=null&&<div className="rounded-2xl bg-gray-100 p-4"><div className="flex items-end gap-3"><strong className="text-4xl font-extrabold text-gray-900">{aqi}</strong><span className="pb-1 text-sm font-semibold text-gray-700">{aqiText(aqi)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-300"><div className="h-full rounded-full bg-[#42a86c]" style={{width:Math.min(100,aqi/3)+"%"}}/></div><p className="mt-3 text-xs leading-relaxed text-gray-500">CAMS model guidance · US AQI reference, not an official CPCB station reading.</p></div>}
    {!airLoading&&!airError&&aqi==null&&<p className="text-sm text-gray-500">Air-quality data unavailable for this location.</p>}
  </section>;

  const radarSection = <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 @container/dynamicMap rounded-2xl p-4" aria-label="Radar">
    <div className="flex items-center justify-between gap-3"><h2 className="text-xl leading-normal tracking-tight text-gray-900 mb-2 font-black">Radar</h2><button type="button" onClick={()=>onNavigate("Radar")} className="text-sm font-semibold text-[#003399]">Open Radar</button></div>
    <div className="relative h-80 overflow-hidden rounded-2xl bg-gray-100">
      {radarLoading&&!radar&&<div className="absolute inset-0 grid place-items-center text-sm text-gray-500">Loading radar…</div>}
      {radarError&&!radar&&<div className="absolute inset-0 grid place-items-center p-4 text-sm text-gray-500">{radarError}</div>}
      {radar&&frame&&location&&<div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
        {tiles.map(tile=><div className="relative overflow-hidden bg-gray-100" key={tile.key}>
          <img className="absolute inset-0 h-full w-full object-cover" src={"https://tile.openstreetmap.org/"+zoom+"/"+tile.x+"/"+tile.y+".png"} alt="" loading="lazy"/>
          <img className="absolute inset-0 h-full w-full object-cover opacity-80 mix-blend-multiply" src={(radar.host||"")+frame.path+"/256/"+zoom+"/"+tile.x+"/"+tile.y+"/2/1_1.png"} alt="" loading="lazy"/>
        </div>)}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-1 text-xs font-bold shadow">⌖ {location.name}</span>
      </div>}
      {(!radar||!frame||!location)&&!radarLoading&&!radarError&&<div className="absolute inset-0 grid place-items-center text-sm text-gray-500">Radar coverage unavailable.</div>}
    </div>
    <div className="mt-3 flex items-center gap-3"><button type="button" className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white" onClick={()=>setPlaying(v=>!v)}>{playing?"Pause":"Play"}</button><input className="min-w-0 flex-1" type="range" min="0" max={Math.max(0,frames.length-1)} value={Math.max(0,frameIndex)} aria-label="Radar timeline" onChange={e=>{setPlaying(false);setFrameIndex(Number(e.target.value));}}/><button type="button" onClick={()=>setZoom(v=>Math.min(7,v+1))} className="rounded border border-gray-300 px-3 py-2">+</button><button type="button" onClick={()=>setZoom(v=>Math.max(3,v-1))} className="rounded border border-gray-300 px-3 py-2">−</button></div>
    <p className="mt-2 text-xs text-gray-500">Recent RainViewer radar frames · Map data © OpenStreetMap. Historical frames only; no live nowcast is implied.</p>
  </section>;

  const worldCities = <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 rounded-2xl p-4">
    <div className="flex items-center justify-between"><h2 className="text-xl leading-normal tracking-tight font-bold text-gray-900">Weather around the world</h2></div>
    <div className="mt-2 flex flex-col divide-y divide-gray-200">
      {cities.slice(0,6).map(city=><div key={city.name} className="flex items-center justify-between gap-3 py-3"><div><strong className="text-sm text-gray-900">{city.name}</strong><p className="text-xs text-gray-500">{weatherLabel(city.current?.weather_code)}</p></div><strong className="text-lg text-gray-900">{value(city.current?.temperature_2m)}°</strong></div>)}
    </div>
  </section>;

  const pageTitle = mode==="Weather Report" ? (location?.name||"Local")+" Weather"
    : mode==="Hourly" ? (location?.name||"Local")+" Hourly Forecast"
    : mode==="10 Day" ? (location?.name||"Local")+" Daily Forecast"
    : mode==="Radar" ? (location?.name||"Local")+" Radar"
    : mode==="Air Quality" ? (location?.name||"Local")+" Air Quality"
    : mode==="Allergy" ? (location?.name||"Local")+" Allergy Forecast" : "Storm Reports";

  const main = mode==="Weather Report" ? <>
    <div className="flex flex-col gap-1 mb-3">
      <div className="flex min-h-0 items-center"><h1 className="text-2xl leading-tight tracking-tight font-extrabold text-gray-900 max-md:text-xl max-md:font-bold">{pageTitle}</h1></div>
      <div className="flex flex-wrap items-center gap-1"><h2 className="text-sm leading-snug tracking-tight font-medium text-gray-900">{location?.region||"Your location"}</h2></div>
    </div>
    <div className="flex flex-col gap-12">{currentCard}{hourlySection}{currentDetails}{dailySection}{radarSection}</div>
    <p className="mt-4 text-xs leading-relaxed text-gray-500">Forecasts are numerical weather-model guidance, not measurements from a local weather station or direct satellite observations. Source: {provider}.</p>
  </> : mode==="Hourly" ? <>
    <div className="mb-4"><h1 className="text-2xl leading-normal tracking-tight font-extrabold text-gray-900 max-md:text-xl">{pageTitle}</h1><p className="text-sm text-gray-600">{location?.region||"Next 24 hours"}</p></div>
    <div className="flex flex-col gap-12">{hourlySection}{currentDetails}{radarSection}</div>
  </> : mode==="10 Day" ? <>
    <div className="mb-4"><h1 className="text-2xl leading-normal tracking-tight font-extrabold text-gray-900 max-md:text-xl">{pageTitle}</h1><p className="text-sm text-gray-600">{location?.region||"Extended outlook"}</p></div>
    <div className="flex flex-col gap-12">{dailySection}{currentDetails}</div>
  </> : mode==="Radar" ? <>
    <div className="mb-4"><h1 className="text-2xl leading-normal tracking-tight font-extrabold text-gray-900 max-md:text-xl">{pageTitle}</h1><p className="text-sm text-gray-600">Recent precipitation radar frames centred on {location?.name||"your location"}.</p></div>
    {radarSection}
  </> : mode==="Air Quality" ? <>
    <div className="mb-4"><h1 className="text-2xl leading-normal tracking-tight font-extrabold text-gray-900 max-md:text-xl">{pageTitle}</h1><p className="text-sm text-gray-600">CAMS modelled pollutant concentration and AQI reference.</p></div>
    <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 rounded-2xl p-4">
      <h2 className="text-xl leading-normal tracking-tight font-bold text-gray-900">Air Quality Index</h2>
      {aqi==null?<p className="mt-4 rounded-2xl bg-gray-100 p-6 text-sm text-gray-600">{airError||"Air-quality data unavailable."}</p>:<div className="mt-4 rounded-2xl bg-gray-100 p-6"><span className="text-xs font-bold uppercase tracking-wider text-gray-600">US AQI reference scale</span><strong className="block text-6xl font-extrabold text-gray-900">{aqi}</strong><span className="text-lg font-semibold text-gray-700">{aqiText(aqi)}</span><p className="mt-3 text-xs text-gray-600">{air?.note||"Modelled CAMS guidance, not an official CPCB station observation."}</p></div>}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">{[["PM2.5",air?.current?.pm2_5],["PM10",air?.current?.pm10],["Ozone",air?.current?.ozone],["Nitrogen dioxide",air?.current?.nitrogen_dioxide],["Sulphur dioxide",air?.current?.sulphur_dioxide],["Carbon monoxide",air?.current?.carbon_monoxide]].map(([name,n])=><div key={String(name)} className="rounded-xl bg-gray-100 p-4"><span className="text-sm text-gray-600">{name}</span><strong className="mt-2 block text-2xl text-gray-900">{value(n,1)}</strong><small className="text-xs text-gray-500">μg/m³</small></div>)}</div>
      <p className="mt-4 text-xs leading-relaxed text-gray-500">Source: {air?.source?.name||"Open-Meteo CAMS"} · nominal resolution {air?.source?.resolution_km||45} km. Not a local monitor or official Indian CPCB AQI station.</p>
    </section>
  </> : mode==="Allergy" ? <>
    <div className="mb-4"><h1 className="text-2xl leading-normal tracking-tight font-extrabold text-gray-900 max-md:text-xl">{pageTitle}</h1><p className="text-sm text-gray-600">Pollen and seasonal allergy forecast</p></div>
    <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 rounded-2xl p-4"><h2 className="text-xl font-bold text-gray-900">Seasonal Allergies and Pollen Count Forecast</h2><div className="mt-4 rounded-2xl bg-gray-100 p-6"><strong className="text-gray-900">Pollen data is not available for this location.</strong><p className="mt-2 text-sm text-gray-600">The connected public provider does not supply reliable pollen coverage for this region. No pollen level is fabricated.</p></div></section>
  </> : <>
    <div className="mb-4"><h1 className="text-2xl leading-normal tracking-tight font-extrabold text-gray-900 max-md:text-xl">Storm Reports</h1><p className="text-sm text-gray-600">Severe weather event entries</p></div>
    <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 rounded-2xl p-4"><h2 className="text-xl font-bold text-gray-900">Storm and event reports</h2>{storms.length?storms.map(storm=><article key={storm.id} className="mt-3 rounded-xl border border-gray-200 p-4"><strong>{storm.title}</strong><p className="mt-1 text-sm text-gray-600">{storm.description||"Curated event entry from NASA EONET."}</p>{storm.link&&<a className="mt-2 inline-block text-sm text-blue-700" href={storm.link} target="_blank" rel="noreferrer">Source ↗</a>}</article>):<p className="mt-4 rounded-xl bg-gray-100 p-4 text-sm text-gray-600">No open event entries are currently available.</p>}<p className="mt-3 text-xs text-gray-500">NASA EONET is a curated natural-event catalogue, not an official warning authority or complete cyclone tracker.</p></section>
  </>;

  return <div className="wx-weather-content-grid w-full mx-auto gap-6 p-4">
    <div className="min-w-0" style={{gridArea:"contentTop"}}>
      <div className="flex flex-col gap-12">
      </div>
    </div>
    <div className="min-w-0" style={{gridArea:"main"}}>
      <div className="flex flex-col gap-12">
        {forecastLoading&&!forecast&&<p className="text-sm text-gray-500">Loading forecast…</p>}
        {forecastError&&!forecast&&<p className="rounded-xl bg-gray-100 p-4 text-sm text-gray-600">{forecastError}</p>}
        {main}
      </div>
    </div>
    <div className="min-w-0" style={{gridArea:"sidebar"}}>
      <div className="flex flex-col gap-12">
        {aqiCard}
        <section className="flex flex-col @container/card text-card-foreground bg-card border-gray-500 rounded-2xl p-4">
          <h2 className="flex pb-4 text-xl leading-normal tracking-tight font-bold text-gray-900">Health & Activities</h2>
          <button type="button" onClick={()=>onNavigate("Allergy")} className="flex items-start gap-3 rounded-xl bg-gray-100 p-3 text-left">
            <Icon name="allergy" className="size-7 shrink-0 text-gray-700"/>
            <span><strong className="text-sm text-gray-900">Seasonal Allergies & Pollen</strong><small className="mt-1 block text-xs text-gray-600">Pollen data is not available for this region.</small></span>
          </button>
        </section>
        {mode==="Weather Report"&&worldCities}
      </div>
    </div>
  </div>;
}
