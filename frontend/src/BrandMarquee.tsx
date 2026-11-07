import { useEffect, useState } from "react";

type BrandItem = {
  name: string;
  role: string;
  href: string;
  kind: "weather" | "imagery" | "events" | "radar" | "alerts" | "news" | "maps" | "platform" | "development";
  monogram: string;
  iconUrl?: string;
  iconFit?: "contain" | "cover" | "wide";
};

const ROW_ONE: BrandItem[] = [
  { name: "Open-Meteo", role: "Primary weather-model data", href: "https://open-meteo.com/", kind: "weather", monogram: "OM", iconUrl: "https://pbs.twimg.com/profile_images/1695024885070737408/-M-HSH5P.jpg", iconFit: "cover" },
  { name: "MET Norway", role: "Fallback forecast provider", href: "https://api.met.no/", kind: "weather", monogram: "MET", iconUrl: "https://weamyl.met.no/assets/images/Met_RGB_Horisontal_ENG.jpg", iconFit: "wide" },
  { name: "NASA GIBS", role: "Satellite imagery layers", href: "https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs", kind: "imagery", monogram: "NASA" },
  { name: "NASA EONET", role: "Curated storm-event metadata", href: "https://eonet.gsfc.nasa.gov/", kind: "events", monogram: "EONET" },
  { name: "RainViewer", role: "Historical radar frames", href: "https://www.rainviewer.com/", kind: "radar", monogram: "RV", iconUrl: "https://www.rainviewer.com/logo-v1.png", iconFit: "cover" },
  { name: "OpenStreetMap", role: "Map data & place search", href: "https://www.openstreetmap.org/", kind: "maps", monogram: "OSM", iconUrl: "https://cdn.simpleicons.org/openstreetmap/5B8061" },
];

const ROW_TWO: BrandItem[] = [
  { name: "NDMA SACHET", role: "India public alert feeds", href: "https://sachet.ndma.gov.in/", kind: "alerts", monogram: "NDMA" },
  { name: "NASA Earth Science", role: "Global science news feed", href: "https://science.nasa.gov/", kind: "news", monogram: "NASA" },
  { name: "NOAA", role: "Weather news · U.S. alerts", href: "https://www.noaa.gov/", kind: "news", monogram: "NOAA" },
  { name: "Firebase Hosting", role: "Website hosting & sign-in", href: "https://firebase.google.com/", kind: "platform", monogram: "FB" },
  { name: "Render", role: "Weather API hosting", href: "https://render.com/", kind: "platform", monogram: "R" },
  { name: "GitHub Actions", role: "Build & deployment workflow", href: "https://github.com/MohammedRiyashB/earthweatherchannel/actions", kind: "platform", monogram: "GH" },
  { name: "ChatGPT · OpenAI", role: "AI-assisted development", href: "https://openai.com/brand/", kind: "development", monogram: "AI", iconUrl: "https://openai.com/favicon.svg", iconFit: "contain" },
];

function BrandTile({ item, decorative = false }: { item: BrandItem; decorative?: boolean }) {
  return (
    <a
      className={`source-brand-tile source-brand-${item.kind}`}
      href={item.href}
      target="_blank"
      rel="noreferrer"
      tabIndex={decorative ? -1 : undefined}
      aria-label={decorative ? undefined : `${item.name}: ${item.role}`}
    >
      <span className={`source-brand-monogram ${item.iconFit === "wide" ? "is-wide" : ""}`} aria-hidden="true">
        {item.iconUrl ? <img className={`source-brand-icon-fit-${item.iconFit || "contain"}`} src={item.iconUrl} alt="" loading="lazy" decoding="async" onError={event => { event.currentTarget.style.display = "none"; }} /> : item.monogram}
      </span>
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
          {items.map(item => <BrandTile item={item} key={item.name} decorative />)}
        </div>
      </div>
    </div>
  );
}

export default function BrandMarquee() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const section = document.querySelector<HTMLElement>(".source-brand-showcase");
    if (!section || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      setActive(Boolean(entries[0]?.isIntersecting));
    }, { rootMargin: "140px 0px", threshold: 0.01 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="source-brand-showcase" aria-label="Weather data sources and development tools">
      <div className="source-brand-motion">
        <BrandRail items={ROW_ONE} direction="left" active={active} />
        <BrandRail items={ROW_TWO} direction="right" active={active} />
      </div>
    </section>
  );
}
