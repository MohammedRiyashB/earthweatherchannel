import { useEffect, useState } from "react";

type BrandItem = {
  name: string;
  role: string;
  href: string;
  kind: "weather" | "imagery" | "events" | "radar" | "alerts" | "news" | "maps" | "development";
  monogram: string;
};

const ROW_ONE: BrandItem[] = [
  { name: "Open-Meteo", role: "Primary weather data", href: "https://open-meteo.com/", kind: "weather", monogram: "OM" },
  { name: "MET Norway", role: "Forecast fallback", href: "https://api.met.no/", kind: "weather", monogram: "MET" },
  { name: "NASA GIBS", role: "Satellite imagery layers", href: "https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs", kind: "imagery", monogram: "GIBS" },
  { name: "NASA EONET", role: "Curated event catalogue", href: "https://eonet.gsfc.nasa.gov/", kind: "events", monogram: "EONET" },
  { name: "RainViewer", role: "Historical radar frames", href: "https://www.rainviewer.com/", kind: "radar", monogram: "RV" },
];

const ROW_TWO: BrandItem[] = [
  { name: "NDMA SACHET", role: "India public alert feeds", href: "https://sachet.ndma.gov.in/", kind: "alerts", monogram: "NDMA" },
  { name: "NASA Earth Science", role: "Global science news feed", href: "https://science.nasa.gov/", kind: "news", monogram: "NASA" },
  { name: "NOAA", role: "Weather news · U.S. alerts", href: "https://www.noaa.gov/", kind: "news", monogram: "NOAA" },
  { name: "OpenStreetMap", role: "Maps & place search", href: "https://www.openstreetmap.org/", kind: "maps", monogram: "OSM" },
  { name: "OpenAI · ChatGPT", role: "AI-assisted development", href: "https://openai.com/brand/", kind: "development", monogram: "AI" },
];

function BrandTile({ item }: { item: BrandItem }) {
  return (
    <a className={`source-brand-tile source-brand-${item.kind}`} href={item.href} target="_blank" rel="noreferrer">
      <span className="source-brand-monogram" aria-hidden="true">{item.monogram}</span>
      <span className="source-brand-copy">
        <strong>{item.name}</strong>
        <small>{item.role}</small>
      </span>
      <span className="source-brand-arrow" aria-hidden="true">↗</span>
    </a>
  );
}

function BrandRail({ items, direction, active }: { items: BrandItem[]; direction: "left" | "right"; active: boolean }) {
  return (
    <div className={`source-brand-rail ${active ? "is-active" : ""}`}>
      <div className={`source-brand-track move-${direction}`}>
        <div className="source-brand-group">
          {items.map(item => <BrandTile item={item} key={item.name} />)}
        </div>
        <div className="source-brand-group" aria-hidden="true">
          {items.map(item => <BrandTile item={item} key={item.name} />)}
        </div>
      </div>
    </div>
  );
}

export default function BrandMarquee() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const section = document.querySelector<HTMLElement>(".source-brand-showcase");
    if (!section) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      setActive(Boolean(entries[0]?.isIntersecting));
    }, { rootMargin: "100px 0px", threshold: 0.01 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="source-brand-showcase" aria-labelledby="source-brand-title">
      <div className="source-brand-heading">
        <span className="eyebrow">DATA SOURCES & DEVELOPMENT CREDITS</span>
        <h2 id="source-brand-title">The technology behind the forecast</h2>
        <p>Weather data, imagery, public information and development tools used in this project.</p>
      </div>
      <div className="source-brand-motion" onMouseEnter={() => setActive(false)} onMouseLeave={() => setActive(true)}>
        <BrandRail items={ROW_ONE} direction="left" active={active} />
        <BrandRail items={ROW_TWO} direction="right" active={active} />
      </div>
      <p className="source-brand-note">
        Provider names identify data sources or tools referenced by this project. Their appearance does not imply sponsorship, endorsement or a formal partnership. OpenAI / ChatGPT is credited for AI-assisted development, not as a weather-data provider.
      </p>
    </section>
  );
}
