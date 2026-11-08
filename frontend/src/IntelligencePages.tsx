import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL || "https://earthweather-api.onrender.com";

type ForecastPayload = {
  current?: Record<string, number | string | null>;
  hourly?: Record<string, (string | number | null)[]>;
  daily?: Record<string, (string | number | null)[]>;
  source?: { provider?: string; name?: string; url?: string; cache_seconds?: number; last_modified?: string | null };
  fallback_reason?: string;
};
type SourceCheck = {
  id: string;
  role?: string;
  status: string;
  latency_ms?: number;
  http_status?: number;
  error?: string;
  checked_at?: string;
};
type StormEvent = {
  id: string;
  title: string;
  description?: string;
  link?: string;
  coordinates?: { lat: number; lon: number; date?: string }[];
};

const metric = (value: unknown, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : "—";
const timeLabel = (value: unknown) => {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const dateLabel = (value: unknown) => {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
};
const weatherText = (code: unknown) => {
  if (typeof code !== "number") return "Forecast";
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Variable";
};
const sourceLabel = (id: string) => ({
  metnorway: "MET Norway · primary weather model",
  "open-meteo": "Open-Meteo · fallback weather model",
  "nasa-gibs": "NASA GIBS · satellite imagery",
  "nasa-eonet": "NASA EONET · event catalogue",
  rainviewer: "RainViewer · past radar frames",
}[id] || id.replaceAll("-", " "));

export function AdvancedForecastCenter({
  latitude,
  longitude,
  placeName,
}: {
  latitude?: number;
  longitude?: number;
  placeName?: string;
}) {
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  useEffect(() => {
    if (!hasCoordinates || latitude == null || longitude == null) {
      setForecast(null);
      setError("Choose a city in Weather Report to load its forecast.");
      return;
    }
    let active = true;
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      days: "7",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "auto",
    });
    setLoading(true);
    setError("");
    fetch(`${API}/api/forecast?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.detail?.message || payload?.detail || `Forecast service returned ${response.status}`);
        }
        return response.json() as Promise<ForecastPayload>;
      })
      .then((data) => {
        if (!active) return;
        setForecast(data);
        setError("");
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Forecast data is unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [latitude, longitude, hasCoordinates, refreshKey]);

  const hourly = forecast?.hourly || {};
  const daily = forecast?.daily || {};
  const hourlyRows = useMemo(() => {
    const times = hourly.time || [];
    return times.slice(0, 24).map((time, index) => ({
      time,
      temp: hourly.temperature_2m?.[index],
      code: hourly.weather_code?.[index],
      rain: hourly.precipitation_probability?.[index],
      wind: hourly.wind_speed_10m?.[index],
    }));
  }, [forecast]);
  const dailyRows = useMemo(() => {
    const times = daily.time || [];
    return times.slice(0, 7).map((time, index) => ({
      time,
      code: daily.weather_code?.[index],
      high: daily.temperature_2m_max?.[index],
      low: daily.temperature_2m_min?.[index],
      rain: daily.precipitation_sum?.[index],
      wind: daily.wind_speed_10m_max?.[index],
    }));
  }, [forecast]);

  return (
    <section className="section-block intelligence-section" aria-labelledby="advanced-forecast-title">
      <div className="section-heading intelligence-heading">
        <div>
          <span className="eyebrow">HOURLY + 7-DAY MODEL GUIDANCE</span>
          <h2 id="advanced-forecast-title">Advanced Forecast Center</h2>
          <p>{placeName ? `Forecast for ${placeName}` : "Location-based forecast"}</p>
        </div>
        <button className="refresh-button intelligence-refresh" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          {loading ? "Updating…" : "↻ Refresh forecast"}
        </button>
      </div>
      {error && <div className="intelligence-message">{error}</div>}
      {forecast && (
        <>
          <div className="intelligence-sourcebar">
            <span className={forecast.source?.provider === "metnorway" ? "intelligence-status is-live" : "intelligence-status"}>
              {forecast.source?.provider === "metnorway" ? "PRIMARY SOURCE" : "FALLBACK SOURCE"}
            </span>
            <strong>{forecast.source?.name || forecast.source?.provider || "Weather model"}</strong>
            {forecast.source?.cache_seconds ? <span>Cache window: {Math.round(forecast.source.cache_seconds / 3600)}h</span> : null}
            {forecast.source?.url ? <a href={forecast.source.url} target="_blank" rel="noreferrer">Provider details ↗</a> : null}
          </div>
          {forecast.fallback_reason && <p className="intelligence-footnote">MET Norway did not return a valid response for this request; the validated Open-Meteo fallback is shown.</p>}
          <div className="forecast-hourly-wrap">
            <div className="intelligence-subheading"><h3>Next forecast steps</h3><span>Local time · °C · km/h</span></div>
            {hourlyRows.length ? (
              <div className="forecast-hourly">
                {hourlyRows.map((row, index) => (
                  <article className="forecast-hour" key={String(row.time) + index}>
                    <small>{timeLabel(row.time)}</small>
                    <strong>{metric(row.temp, 0)}°</strong>
                    <span>{weatherText(row.code)}</span>
                    <small>Rain {metric(row.rain, 0)}%</small>
                    <small>Wind {metric(row.wind)} km/h</small>
                  </article>
                ))}
              </div>
            ) : <div className="intelligence-message">Hourly forecast values are not available from the selected provider.</div>}
          </div>
          <div className="intelligence-subheading forecast-daily-heading"><h3>7-day outlook</h3><span>Daily maximum / minimum</span></div>
          <div className="forecast-daily">
            {dailyRows.map((row, index) => (
              <article className="forecast-day" key={String(row.time) + index}>
                <div><strong>{dateLabel(row.time)}</strong><small>{weatherText(row.code)}</small></div>
                <strong>{metric(row.high, 0)}° <span>/ {metric(row.low, 0)}°</span></strong>
                <small>Rain {metric(row.rain)} mm · Wind {metric(row.wind)} km/h</small>
              </article>
            ))}
          </div>
        </>
      )}
      <p className="intelligence-footnote">Forecasts are numerical weather-model guidance, not measurements from a local weather station or direct satellite observations. Availability and update time depend on each provider.</p>
    </section>
  );
}

export function EarthWeatherIntelligencePage({
  latitude,
  longitude,
  placeName,
}: {
  latitude?: number;
  longitude?: number;
  placeName?: string;
}) {
  const [weather, setWeather] = useState<Record<string, unknown> | null>(null);
  const [checks, setChecks] = useState<SourceCheck[]>([]);
  const [storms, setStorms] = useState<StormEvent[]>([]);
  const [radarCount, setRadarCount] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const requests: Promise<void>[] = [
      fetch(`${API}/api/health/sources`, { cache: "no-store" })
        .then((response) => { if (!response.ok) throw new Error(`Source health HTTP ${response.status}`); return response.json(); })
        .then((data) => { if (active) { setChecks(data.checks || []); setCheckedAt(data.checked_at || ""); } })
        .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Source health unavailable."); }),
      fetch(`${API}/api/cyclones`, { cache: "no-store" })
        .then((response) => { if (!response.ok) throw new Error(`Storm feed HTTP ${response.status}`); return response.json(); })
        .then((data) => { if (active) setStorms(data.events || []); })
        .catch(() => { if (active) setStorms([]); }),
      fetch(`${API}/api/radar`, { cache: "no-store" })
        .then((response) => { if (!response.ok) throw new Error(`Radar feed HTTP ${response.status}`); return response.json(); })
        .then((data) => { if (active) setRadarCount(Array.isArray(data.frames) ? data.frames.length : 0); })
        .catch(() => { if (active) setRadarCount(null); }),
    ];
    if (hasCoordinates && latitude != null && longitude != null) {
      const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
      requests.push(
        fetch(`${API}/api/weather?${params.toString()}`, { cache: "no-store" })
          .then((response) => { if (!response.ok) throw new Error(`Current weather HTTP ${response.status}`); return response.json(); })
          .then((data) => { if (active) setWeather(data.current || null); })
          .catch(() => { if (active) setWeather(null); })
      );
    } else {
      setWeather(null);
    }
    Promise.allSettled(requests).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [latitude, longitude, hasCoordinates, refreshKey]);

  const current = (weather || {}) as Record<string, unknown>;
  const statusTone = (status: string) => status === "online" ? "is-live" : status === "degraded" || status === "rate_limited" ? "is-warning" : "is-muted";

  return (
    <main className="news-main intelligence-page">
      <div className="news-toolbar">
        <div>
          <span className="eyebrow">GLOBAL ATMOSPHERIC + EARTH OBSERVATION</span>
          <h1>Earth Weather Intelligence</h1>
          <p>Weather-model analysis, verified satellite catalogue status, severe-event metadata and live provider health.</p>
        </div>
        <button className="refresh-button intelligence-refresh" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          {loading ? "Checking…" : "↻ Refresh intelligence"}
        </button>
      </div>
      <div className="intelligence-locationbar">
        <span>FOCUS LOCATION</span><strong>{placeName || "Select a city in Weather Report"}</strong>
        {hasCoordinates && <small>{Number(latitude).toFixed(3)}°, {Number(longitude).toFixed(3)}°</small>}
      </div>
      {error && <div className="intelligence-message">{error}</div>}
      <section className="intelligence-overview-grid">
        <article className="intelligence-card intelligence-weather-card">
          <span className="eyebrow">CURRENT WEATHER MODEL</span>
          <h2>{metric(current.temperature_2m, 0)}°C</h2>
          <p>{weatherText(current.weather_code)}</p>
          <div className="intelligence-metric-pair">
            <span>Humidity <strong>{metric(current.relative_humidity_2m, 0)}%</strong></span>
            <span>Wind <strong>{metric(current.wind_speed_10m)} km/h</strong></span>
            <span>Pressure <strong>{metric(current.pressure_msl, 0)} hPa</strong></span>
          </div>
          <small>{typeof current.source === "string" ? current.source : "No verified current weather response yet."}</small>
        </article>
        <article className="intelligence-card">
          <span className="eyebrow">SEVERE EVENT CATALOGUE</span>
          <h2>{storms.length}</h2>
          <p>Open NASA EONET severe-storm event entries</p>
          <small>Curated event metadata; not a complete cyclone tracker or official warning service.</small>
        </article>
        <article className="intelligence-card">
          <span className="eyebrow">RADAR ARCHIVE</span>
          <h2>{radarCount == null ? "—" : radarCount}</h2>
          <p>Past radar frames reported by RainViewer</p>
          <small>Historical frames only. This feed is not a live radar nowcast.</small>
        </article>
      </section>
      <section className="intelligence-panel">
        <div className="intelligence-subheading">
          <div><span className="eyebrow">PROVIDER OBSERVABILITY</span><h2>Weather Data Intelligence</h2></div>
          <small>{checkedAt ? `Last checked ${new Date(checkedAt).toLocaleString()}` : "Source checks pending"}</small>
        </div>
        <div className="intelligence-pipeline">
          <div><small>PRIMARY WEATHER</small><strong>MET Norway Locationforecast</strong><span>Global model analysis · provider-aware cache</span></div>
          <div className="pipeline-arrow">→</div>
          <div><small>FALLBACK WEATHER</small><strong>Open-Meteo</strong><span>Used when primary request fails validation</span></div>
        </div>
        <div className="intelligence-source-list">
          {checks.map((item) => (
            <article className="intelligence-source-row" key={item.id}>
              <div><strong>{sourceLabel(item.id)}</strong><small>{item.role || "Supporting data service"}</small></div>
              <div className="intelligence-source-meta">
                {typeof item.latency_ms === "number" && <span>{item.latency_ms} ms</span>}
                {typeof item.http_status === "number" && <span>HTTP {item.http_status}</span>}
                <span className={`intelligence-status ${statusTone(item.status)}`}>{item.status.replaceAll("_", " ")}</span>
              </div>
            </article>
          ))}
          {!checks.length && <div className="intelligence-message">Provider checks have not returned data yet.</div>}
        </div>
      </section>
      <p className="intelligence-footnote">A service responding successfully does not prove forecast accuracy, freshness or complete geographic coverage. Provider roles and status are shown separately. {loading ? "Refreshing checks…" : ""}</p>
    </main>
  );
}

export function GlobalStormIntelligence({ storms: initialStorms = [] }: { storms?: StormEvent[] }) {
  const [storms, setStorms] = useState<StormEvent[]>(initialStorms);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");
  const [error, setError] = useState("");

  const refresh = () => {
    setLoading(true);
    fetch(`${API}/api/cyclones`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Storm feed HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setStorms(data.events || []);
        setCheckedAt(data.retrieved_at || "");
        setError("");
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Storm event feed unavailable."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setStorms(initialStorms);
  }, [initialStorms]);

  useEffect(() => { refresh(); }, []);

  return (
    <section className="section-block intelligence-section intelligence-storms">
      <div className="section-heading intelligence-heading">
        <div><span className="eyebrow">GLOBAL SEVERE-EVENT MONITOR</span><h2>Global Storm Intelligence</h2></div>
        <button type="button" className="refresh-button intelligence-refresh" onClick={refresh} disabled={loading}>{loading ? "Updating…" : "↻ Refresh storm feed"}</button>
      </div>
      {checkedAt && <p className="intelligence-muted">NASA EONET feed retrieved {new Date(checkedAt).toLocaleString()}</p>}
      {error && <div className="intelligence-message">{error}</div>}
      {storms.length ? (
        <div className="intelligence-storm-list">
          {storms.slice(0, 12).map((storm) => {
            const lastPoint = storm.coordinates?.[storm.coordinates.length - 1];
            return (
              <article className="intelligence-storm-row" key={storm.id}>
                <div className="storm-mark">!</div>
                <div className="storm-copy">
                  <strong>{storm.title}</strong>
                  <p>{storm.description || "An event is listed in NASA EONET's severe-storm catalogue."}</p>
                  <small>{lastPoint ? `Latest mapped point ${lastPoint.lat.toFixed(2)}°, ${lastPoint.lon.toFixed(2)}°` : "No mapped coordinate returned"}{lastPoint?.date ? ` · ${dateLabel(lastPoint.date)}` : ""}</small>
                </div>
                {storm.link && <a href={storm.link} target="_blank" rel="noreferrer">Source ↗</a>}
              </article>
            );
          })}
        </div>
      ) : <div className="intelligence-message">No open severe-storm entries were returned by NASA EONET in the latest check. This is not proof that no severe weather exists.</div>}
      <p className="intelligence-footnote">NASA EONET is a curated natural-event catalogue, not an official warning authority or a complete tropical-cyclone tracking system. India-specific official warnings and cyclone tracks require verified IMD products.</p>
    </section>
  );
}
