import { useEffect, useState } from "react";

type BrandItem = { name: string; href: string };

// Verified integrations currently used by EARTH WEATHER. Future or
// authentication-required sources are intentionally not shown as connected.
const ROW_ONE: BrandItem[] = [
  { name: "Open-Meteo", href: "https://open-meteo.com/" },
  { name: "MET Norway", href: "https://api.met.no/" },
  { name: "NASA GIBS", href: "https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" },
  { name: "NOAA GOES", href: "https://www.noaa.gov/" },
  { name: "NASA EONET", href: "https://eonet.gsfc.nasa.gov/" },
  { name: "RainViewer", href: "https://www.rainviewer.com/" },
  { name: "OpenStreetMap", href: "https://www.openstreetmap.org/" },
  { name: "CesiumJS", href: "https://cesium.com/platform/cesiumjs/" },
];

const ROW_TWO: BrandItem[] = [
  { name: "Firebase", href: "https://firebase.google.com/" },
  { name: "Firebase Hosting", href: "https://firebase.google.com/products/hosting" },
  { name: "Render", href: "https://render.com/" },
  { name: "GitHub Actions", href: "https://github.com/MohammedRiyashB/earthweatherchannel/actions" },
  { name: "React", href: "https://react.dev/" },
  { name: "TypeScript", href: "https://www.typescriptlang.org/" },
  { name: "Vite", href: "https://vite.dev/" },
  { name: "FastAPI", href: "https://fastapi.tiangolo.com/" },
  { name: "HTTPX", href: "https://www.python-httpx.org/" },
  { name: "ChatGPT", href: "https://openai.com/chatgpt/overview/" },
  { name: "BMR INC.", href: "https://github.com/MohammedRiyashB/BMR-Inc" },
];

function BrandName({ item, decorative = false }: { item: BrandItem; decorative?: boolean }) {
  return (
    <a
      className="source-brand-name"
      href={item.href}
      target="_blank"
      rel="noreferrer"
      tabIndex={decorative ? -1 : undefined}
      aria-label={decorative ? undefined : item.name}
      aria-hidden={decorative ? true : undefined}
    >
      {item.name}
    </a>
  );
}

function BrandRail({ items, direction, active }: { items: BrandItem[]; direction: "left" | "right"; active: boolean }) {
  return (
    <div className={`source-brand-rail ${active ? "is-active" : ""}`}>
      <div className={`source-brand-track move-${direction}`}>
        <div className="source-brand-group">
          {items.map(item => <BrandName item={item} key={item.name} />)}
        </div>
        <div className="source-brand-group" aria-hidden="true">
          {items.map(item => <BrandName item={item} key={item.name} decorative />)}
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
    }, { rootMargin: "100px 0px", threshold: 0.01 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="source-brand-showcase" aria-label="Weather data providers, technology and development credits">
      <div className="source-brand-motion">
        <BrandRail items={ROW_ONE} direction="left" active={active} />
        <BrandRail items={ROW_TWO} direction="right" active={active} />
      </div>
    </section>
  );
}
