import { useEffect, useState } from "react";

type BrandItem = { name: string; href: string };

const ROW_ONE: BrandItem[] = [
  { name: "Open-Meteo", href: "https://open-meteo.com/" },
  { name: "MET Norway", href: "https://api.met.no/" },
  { name: "NASA GIBS", href: "https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" },
  { name: "NASA EONET", href: "https://eonet.gsfc.nasa.gov/" },
  { name: "RainViewer", href: "https://www.rainviewer.com/" },
  { name: "OpenStreetMap", href: "https://www.openstreetmap.org/" },
];

const ROW_TWO: BrandItem[] = [
  { name: "NDMA SACHET", href: "https://sachet.ndma.gov.in/" },
  { name: "NASA Earth Science", href: "https://science.nasa.gov/" },
  { name: "NOAA", href: "https://www.noaa.gov/" },
  { name: "Firebase", href: "https://firebase.google.com/" },
  { name: "Render", href: "https://render.com/" },
  { name: "GitHub Actions", href: "https://github.com/MohammedRiyashB/earthweatherchannel/actions" },
  { name: "ChatGPT", href: "https://openai.com/" },
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
    <section className="source-brand-showcase" aria-label="Weather data and development contributors">
      <div className="source-brand-motion">
        <BrandRail items={ROW_ONE} direction="left" active={active} />
        <BrandRail items={ROW_TWO} direction="right" active={active} />
      </div>
    </section>
  );
}
