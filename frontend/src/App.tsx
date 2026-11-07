import { useCallback, useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";

type Weather = {
  latitude: number; longitude: number; timezone?: string;
  current?: { time: string; temperature_2m?: number; relative_humidity_2m?: number; apparent_temperature?: number; precipitation?: number; cloud_cover?: number; pressure_msl?: number; wind_speed_10m?: number; wind_direction_10m?: number; weather_code?: number };
  hourly?: { time: string[]; precipitation_probability?: number[]; precipitation?: number[]; temperature_2m?: number[]; wind_speed_10m?: number[] };
};
type Source = { id: string; name: string; kind: string; coverage: string; status: string; update: string; note: string };
const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const fmt = (n?: number, suffix = "") => n == null ? "—" : `${Math.round(n)}${suffix}`;
const dateUTC = (daysAgo = 1) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - daysAgo); return d.toISOString().slice(0, 10); };

export default function App() {
  const globeHost = useRef<HTMLDivElement>(null);
  const viewer = useRef<Cesium.Viewer | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [coords, setCoords] = useState<{lat:number; lon:number} | null>(null);
  const [place, setPlace] = useState("Global view");
  const [message, setMessage] = useState("Choose Allow location to load local weather.");
  const [busy, setBusy] = useState(false);
  const [layerOn, setLayerOn] = useState(true);
  const [selectedSatellite, setSelectedSatellite] = useState("VIIRS");
  const satelliteLayer = useRef<Cesium.ImageryLayer | null>(null);
  const [panel, setPanel] = useState("overview");

  useEffect(() => {
    if (!globeHost.current || viewer.current) return;
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) Cesium.Ion.defaultAccessToken = token;
    const v = new Cesium.Viewer(globeHost.current, {
      animation: false, timeline: false, geocoder: false, homeButton: true, sceneModePicker: false,
      navigationHelpButton: false, baseLayerPicker: false, fullscreenButton: false, infoBox: false,
      selectionIndicator: false, shouldAnimate: true,
      imageryProvider: new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" }),
      terrainProvider: new Cesium.EllipsoidTerrainProvider()
    });
    v.scene.globe.enableLighting = true;
    v.scene.skyAtmosphere.show = true;
    v.scene.globe.showGroundAtmosphere = true;
    v.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(15, 18, 25500000) });
    const nasa = new Cesium.UrlTemplateImageryProvider({
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${dateUTC(2)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      maximumLevel: 9, credit: "NASA GIBS / VIIRS SNPP"
    });
    const layer = v.imageryLayers.addImageryProvider(nasa);
    layer.alpha = 0.86;
    satelliteLayer.current = layer;
    (layer as Cesium.ImageryLayer & { _earthWeatherLayer?: boolean })._earthWeatherLayer = true;
    viewer.current = v;
    return () => { v.destroy(); viewer.current = null; satelliteLayer.current = null; };
  }, []);

  useEffect(() => {
    fetch(`${API}/api/sources`).then(r => r.ok ? r.json() : []).then(setSources).catch(() => setSources([]));
  }, []);

  const loadWeather = useCallback(async (lat: number, lon: number, label: string) => {
    setBusy(true); setMessage("Loading forecast model data…");
    try {
      const r = await fetch(`${API}/api/weather?latitude=${lat}&longitude=${lon}`);
      if (!r.ok) throw new Error(`Weather service returned ${r.status}`);
      const data = await r.json() as Weather;
      setWeather(data); setCoords({lat, lon}); setPlace(label); setMessage("Weather model data updated.");
      viewer.current?.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, 1900000), duration: 2.2 });
    } catch (e) { setMessage(e instanceof Error ? e.message : "Weather data unavailable."); }
    finally { setBusy(false); }
  }, []);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setMessage("Geolocation is not supported by this browser."); return; }
    setMessage("Waiting for location permission…");
    navigator.geolocation.getCurrentPosition(
      p => loadWeather(p.coords.latitude, p.coords.longitude, "Your location"),
      e => setMessage(e.code === 1 ? "Location permission denied. The global globe still works." : "Could not determine location. Try again."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
    );
  }, [loadWeather]);

  useEffect(() => { locate(); }, [locate]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || !satelliteLayer.current) return;
    const configs: Record<string, {url:string; credit:string; max:number}> = {
      VIIRS: { url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${dateUTC(2)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, credit: "NASA GIBS / VIIRS SNPP", max: 9 },
      "GOES East": { url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt/GOES-East_ABI_GeoColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", credit: "NASA GIBS / NOAA GOES-East ABI GeoColor", max: 9 },
      "GOES West": { url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt/GOES-West_ABI_GeoColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", credit: "NASA GIBS / NOAA GOES-West ABI GeoColor", max: 9 },
      "GOES East IR": { url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/nrt/GOES-East_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", credit: "NASA GIBS / NOAA GOES-East ABI Band 13 IR", max: 9 }
    };
    const cfg = configs[selectedSatellite];
    if (!cfg) return;
    const old = satelliteLayer.current;
    v.imageryLayers.remove(old, false);
    const provider = new Cesium.UrlTemplateImageryProvider({ url: cfg.url, maximumLevel: cfg.max, credit: cfg.credit });
    const next = v.imageryLayers.addImageryProvider(provider);
    next.alpha = 0.9;
    next.show = layerOn;
    satelliteLayer.current = next;
  }, [selectedSatellite, layerOn]);

  const toggleSatellite = () => setLayerOn(v => !v);

  const codeLabel = (code?: number) => {
    if (code == null) return "—";
    if ([0].includes(code)) return "Clear";
    if ([1,2,3].includes(code)) return "Partly cloudy";
    if ([45,48].includes(code)) return "Fog";
    if ([51,53,55,56,57].includes(code)) return "Drizzle";
    if ([61,63,65,66,67,80,81,82].includes(code)) return "Rain";
    if ([71,73,75,77,85,86].includes(code)) return "Snow";
    if ([95,96,99].includes(code)) return "Thunderstorm";
    return "Variable";
  };

  const current = weather?.current;
  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">◎</span><span>EARTH <b>WEATHER</b><small>GLOBAL INTELLIGENCE SYSTEM</small></span></a>
      <div className="top-status"><span className="live-dot"/> DATA SERVICES <b>ONLINE / PARTIAL</b></div>
      <button className="location-btn" onClick={locate} disabled={busy}>⌖ <span>{busy ? "LOCATING…" : "USE MY LOCATION"}</span></button>
    </header>

    <section className="workspace">
      <div className="globe-wrap">
        <div ref={globeHost} className="globe" />
        <div className="globe-overlay">
          <div className="eyebrow">PLANETARY MONITOR</div>
          <div className="globe-title">Earth, in context.</div>
          <div className="globe-subtitle">Satellite imagery · atmospheric models · official alerts</div>
        </div>
        <div className="globe-controls">
          <select className="layer-select" aria-label="Satellite imagery layer" value={selectedSatellite} onChange={e => setSelectedSatellite(e.target.value)}><option value="VIIRS">NASA VIIRS · GLOBAL</option><option value="GOES East">GOES-19 · EAST</option><option value="GOES West">GOES-18 · WEST</option><option value="GOES East IR">GOES EAST · INFRARED</option></select><button className={layerOn ? "active" : ""} onClick={toggleSatellite}>◉ <span>{layerOn ? "LAYER ON" : "LAYER OFF"}</span></button>
          <button onClick={() => viewer.current?.camera.flyHome(2)}>◎ <span>GLOBAL VIEW</span></button>
        </div>
        <div className="attribution">Base map © OpenStreetMap contributors · Imagery © NASA GIBS / NOAA</div>
      </div>

      <aside className="side-panel">
        <div className="panel-head"><div><div className="eyebrow">LOCAL CONDITIONS</div><h1>{place}</h1></div><span className="refresh-indicator">{busy ? "● SYNC" : "● READY"}</span></div>
        <p className="status-line">{message}</p>
        <div className="current-weather">
          <div><div className="eyebrow">MODEL CURRENT</div><div className="temperature">{fmt(current?.temperature_2m, "°")}<span>C</span></div><div className="condition">{codeLabel(current?.weather_code)}</div></div>
          <div className="weather-symbol">☁</div>
        </div>
        <div className="metric-grid">
          <Metric label="FEELS LIKE" value={fmt(current?.apparent_temperature, "°C")} icon="◌"/>
          <Metric label="HUMIDITY" value={fmt(current?.relative_humidity_2m, "%")} icon="◍"/>
          <Metric label="WIND SPEED" value={fmt(current?.wind_speed_10m, " km/h")} icon="≋"/>
          <Metric label="CLOUD COVER" value={fmt(current?.cloud_cover, "%")} icon="☁"/>
          <Metric label="PRESSURE" value={fmt(current?.pressure_msl, " hPa")} icon="⌁"/>
          <Metric label="PRECIPITATION" value={fmt(current?.precipitation, " mm")} icon="♧"/>
        </div>
        <div className="tabs">
          <button className={panel === "overview" ? "selected" : ""} onClick={() => setPanel("overview")}>OVERVIEW</button>
          <button className={panel === "sources" ? "selected" : ""} onClick={() => setPanel("sources")}>DATA SOURCES</button>
        </div>
        {panel === "overview" ? <div className="forecast">
          <div className="section-title">NEXT HOURS <span>MODEL FORECAST</span></div>
          {weather?.hourly?.time?.slice(0, 6).map((t, i) => <div className="forecast-row" key={t}><span>{new Date(t).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</span><b>{fmt(weather.hourly?.temperature_2m?.[i], "°")}</b><span>☂ {fmt(weather.hourly?.precipitation_probability?.[i], "%")}</span><span>≋ {fmt(weather.hourly?.wind_speed_10m?.[i])}</span></div>)}
          {!weather && <div className="empty-state">Allow location to load local forecast.</div>}
          <div className="data-note">Forecast values are numerical weather-model output, not direct satellite measurements.</div>
        </div> : <div className="source-list">
          {sources.map(s => <div className="source-row" key={s.id}><div><b>{s.name}</b><small>{s.coverage} · {s.update}</small><p>{s.note}</p></div><span className={s.status === "connected" ? "source-status connected" : "source-status"}>{s.status.toUpperCase()}</span></div>)}
        </div>}
        <footer className="panel-footer">{coords ? `LAT ${coords.lat.toFixed(3)} / LON ${coords.lon.toFixed(3)}` : "GLOBAL MODE · LOCATION NOT SET"}<span>{current?.time ? new Date(current.time).toLocaleString() : "WAITING FOR DATA"}</span></footer>
      </aside>
    </section>
    <footer className="bottom-bar"><span>EARTH WEATHER <b>0.1.0 MVP</b></span><span>NASA GIBS · OPEN-METEO · OSM</span><span>NOT FOR EMERGENCY USE</span></footer>
  </main>;
}
function Metric({label, value, icon}:{label:string;value:string;icon:string}) {
  return <div className="metric"><span className="metric-icon">{icon}</span><div><small>{label}</small><b>{value}</b></div></div>;
}