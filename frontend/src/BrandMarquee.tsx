import { useEffect, useState } from "react";

type BrandItem = {
  name: string;
  href: string;
  logoUrl: string;
  fit?: "contain" | "wide" | "icon";
};

const NASA_LOGO = "https://www.nasa.gov/wp-content/themes/nasa/assets/images/nasa-logo.svg";

const ROW_ONE: BrandItem[] = [
  { name: "Open-Meteo", href: "https://open-meteo.com/", logoUrl: "https://open-meteo.com/favicon.ico", fit: "icon" },
  { name: "MET Norway", href: "https://api.met.no/", logoUrl: "https://weamyl.met.no/assets/images/Met_RGB_Horisontal_ENG.jpg", fit: "wide" },
  { name: "NASA GIBS", href: "https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs", logoUrl: NASA_LOGO, fit: "wide" },
  { name: "NASA EONET", href: "https://eonet.gsfc.nasa.gov/", logoUrl: NASA_LOGO, fit: "wide" },
  { name: "RainViewer", href: "https://www.rainviewer.com/", logoUrl: "https://www.rainviewer.com/logo-v1.png", fit: "icon" },
  { name: "OpenStreetMap", href: "https://www.openstreetmap.org/", logoUrl: "https://cdn.simpleicons.org/openstreetmap/5B8061", fit: "contain" },
];

const ROW_TWO: BrandItem[] = [
  { name: "NDMA SACHET", href: "https://sachet.ndma.gov.in/", logoUrl: "https://www.google.com/s2/favicons?domain=sachet.ndma.gov.in&sz=128", fit: "icon" },
  { name: "NASA Earth Science", href: "https://science.nasa.gov/", logoUrl: NASA_LOGO, fit: "wide" },
  { name: "NOAA", href: "https://www.noaa.gov/", logoUrl: "https://www.google.com/s2/favicons?domain=noaa.gov&sz=128", fit: "icon" },
  { name: "Firebase", href: "https://firebase.google.com/", logoUrl: "https://cdn.simpleicons.org/firebase/FFCA28", fit: "contain" },
  { name: "Render", href: "https://render.com/", logoUrl: "https://cdn.simpleicons.org/render/46E3B7", fit: "contain" },
  { name: "GitHub Actions", href: "https://github.com/MohammedRiyashB/earthweatherchannel/actions", logoUrl: "https://cdn.simpleicons.org/githubactions/2088FF", fit: "contain" },
  { name: "ChatGPT · OpenAI", href: "https://openai.com/brand/", logoUrl: "https://cdn.simpleicons.org/openai/111111", fit: "contain" },
];

function BrandLogo({ item, decorative = false }: { item: BrandItem; decorative?: boolean }) {
  return (
    <a
      className={`source-brand-logo source-brand-logo-${item.fit || "contain"}`}
      href={item.href}
      target="_blank"
      rel="noreferrer"
      tabIndex={decorative ? -1 : undefined}
      aria-label={decorative ? undefined : item.name}
      title={decorative ? undefined : item.name}
    >
      <img
        src={item.logoUrl}
        alt=""
        loading="eager"
        decoding="async"
        draggable={false}
        onError={event => { event.currentTarget.style.visibility = "hidden"; }}
      />
    </a>
  );
}

function BrandRail({ items, direction, active }: { items: BrandItem[]; direction: "left" | "right"; active: boolean }) {
  return (
    <div className={`source-brand-rail ${active ? "is-active" : ""}`}>
      <div className={`source-brand-track move-${direction}`}>
        <div className="source-brand-group">
          {items.map(item => <BrandLogo item={item} key={item.name} />)}
        </div>
        <div className="source-brand-group" aria-hidden="true">
          {items.map(item => <BrandLogo item={item} key={item.name} decorative />)}
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
    <section className="source-brand-showcase" aria-label="Weather data and development contributor logos">
      <div className="source-brand-motion">
        <BrandRail items={ROW_ONE} direction="left" active={active} />
        <BrandRail items={ROW_TWO} direction="right" active={active} />
      </div>
    </section>
  );
}
