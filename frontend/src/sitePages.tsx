import React from "react";

export type SitePageId =
  | "aboutus" | "mission-vision" | "our-story" | "careers" | "press-media" | "contact"
  | "weather-reports" | "global-weather-news" | "weather-data-sources" | "weather-alerts-safety"
  | "weather-glossary" | "help-center" | "faq"
  | "terms-and-conditions" | "privacy-policy" | "cookie-policy" | "disclaimer"
  | "data-usage-policy" | "copyright-policy"
  | "contact-support" | "report-issue" | "submit-feedback" | "report-weather-data"
  | "accessibility" | "account-security";

type ExternalLink = { label: string; href: string; description?: string };
type Section = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  links?: ExternalLink[];
  note?: string;
};
type PageData = {
  title: string;
  eyebrow: string;
  lead: string;
  sections: Section[];
  reviewed?: string;
};

export const SITE_PATHS: Record<SitePageId, string> = {
  aboutus: "/aboutus",
  "mission-vision": "/mission-vision",
  "our-story": "/our-story",
  careers: "/careers",
  "press-media": "/press-media",
  contact: "/contact",
  "weather-reports": "/weather-reports",
  "global-weather-news": "/global-weather-news",
  "weather-data-sources": "/weather-data-sources",
  "weather-alerts-safety": "/weather-alerts-safety",
  "weather-glossary": "/weather-glossary",
  "help-center": "/help-center",
  faq: "/faq",
  "terms-and-conditions": "/terms-and-conditions",
  "privacy-policy": "/privacy-policy",
  "cookie-policy": "/cookie-policy",
  disclaimer: "/disclaimer",
  "data-usage-policy": "/data-usage-policy",
  "copyright-policy": "/copyright-policy",
  "contact-support": "/contact-support",
  "report-issue": "/report-issue",
  "submit-feedback": "/submit-feedback",
  "report-weather-data": "/report-weather-data",
  accessibility: "/accessibility",
  "account-security": "/account-security",
};

export const FOOTER_GROUPS: { title: string; links: { label: string; page: SitePageId }[] }[] = [
  { title: "Company", links: [
    { label: "About Us", page: "aboutus" },
    { label: "Mission & Vision", page: "mission-vision" },
    { label: "Our Story", page: "our-story" },
    { label: "Careers", page: "careers" },
    { label: "Press & Media", page: "press-media" },
    { label: "Contact", page: "contact" },
  ]},
  { title: "Resources", links: [
    { label: "Weather Reports", page: "weather-reports" },
    { label: "Global Weather News", page: "global-weather-news" },
    { label: "Weather Data Sources", page: "weather-data-sources" },
    { label: "Weather Alerts & Safety", page: "weather-alerts-safety" },
    { label: "Weather Glossary", page: "weather-glossary" },
    { label: "Help Center", page: "help-center" },
    { label: "Frequently Asked Questions", page: "faq" },
  ]},
  { title: "Legal", links: [
    { label: "Terms & Conditions", page: "terms-and-conditions" },
    { label: "Privacy Policy", page: "privacy-policy" },
    { label: "Cookie Policy", page: "cookie-policy" },
    { label: "Disclaimer", page: "disclaimer" },
    { label: "Data Usage Policy", page: "data-usage-policy" },
    { label: "Copyright Policy", page: "copyright-policy" },
  ]},
  { title: "Support", links: [
    { label: "Contact Support", page: "contact-support" },
    { label: "Report an Issue", page: "report-issue" },
    { label: "Submit Feedback", page: "submit-feedback" },
    { label: "Report Weather Data", page: "report-weather-data" },
    { label: "Accessibility", page: "accessibility" },
    { label: "Account & Security", page: "account-security" },
  ]},
];

export function resolveSitePage(pathname: string): SitePageId | null {
  const normalized = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const entry = (Object.entries(SITE_PATHS) as [SitePageId, string][]).find(([, path]) => path === normalized);
  return entry?.[0] ?? null;
}

const PAGES: Record<SitePageId, PageData> = {
  aboutus: {
    eyebrow: "COMPANY · ABOUT EARTH WEATHER",
    title: "Weather information for a connected world.",
    lead: "EARTH WEATHER CHANNEL is a weather-information platform from BMR INC., founded by Mohammed Riyash B. It brings local conditions, city reports, weather-related news, satellite imagery and selected severe-weather information into one accessible experience.",
    sections: [
      { heading: "Who we are", paragraphs: [
        "EARTH WEATHER is being developed to make weather information easier to find and understand, from a person's nearby location to weather conditions and events across the world.",
        "The project is led by founder Mohammed Riyash B under the BMR INC. identity. This page publishes the project and product information currently confirmed by the team; it does not imply an unverified incorporation number, registered office, staff list or corporate certification."
      ]},
      { heading: "What the platform provides", bullets: [
        "Location-based current weather information and a search option for other places.",
        "Current-condition summaries for selected national, regional and international cities.",
        "Weather-related news feeds, including India-focused public alert updates and global Earth-science/weather stories.",
        "A satellite imagery experience using available public NASA GIBS imagery products, subject to layer coverage and acquisition time.",
        "Curated severe-storm event metadata and historical radar frames where a provider has coverage."
      ]},
      { heading: "How we present information", paragraphs: [
        "Current temperature, humidity, wind, cloud and precipitation values are weather-provider or numerical-model data. They are not automatically direct measurements from a nearby ground station or satellite.",
        "Satellite imagery, model-based weather values, curated event metadata and official warnings are different kinds of information. EARTH WEATHER aims to label those distinctions rather than combine them into a single claim."
      ]},
      { heading: "Company identity", paragraphs: [
        "Brand: EARTH WEATHER CHANNEL. Project identity: BMR INC. Founder: Mohammed Riyash B. Public website: earthweatherchannel.web.app.",
        "A public company email, telephone number, postal address and formal registration details have not been supplied for publication. We will not invent them."
      ]},
      { heading: "Important safety note", paragraphs: [
        "EARTH WEATHER is an information platform, not an emergency-response authority. For warnings and urgent safety decisions, follow the responsible official meteorological and disaster-management authorities in your location."
      ], links: [
        { label: "India NDMA SACHET alerts", href: "https://sachet.ndma.gov.in/", description: "Official Government of India disaster alert portal." },
        { label: "India Meteorological Department", href: "https://mausam.imd.gov.in/index_en.php", description: "Official forecasts, warnings and cyclone information." }
      ]}
    ]
  },
  "mission-vision": {
    eyebrow: "COMPANY · MISSION & VISION",
    title: "Useful weather information. Clear decisions.",
    lead: "Our mission and vision guide how EARTH WEATHER presents weather, data sources and safety information.",
    sections: [
      { heading: "Our mission", paragraphs: [
        "To make timely, understandable weather information easier to access by bringing location-based conditions, city reports, weather-related news and selected earth-observation resources together in one place.",
        "To explain where information comes from, show when it was retrieved where available, and distinguish model output from observations, imagery and official alerts."
      ]},
      { heading: "Our vision", paragraphs: [
        "To develop EARTH WEATHER into a dependable, accessible global weather-information platform that helps people explore conditions around them and understand changing weather patterns around the world.",
        "We aim to improve clarity, reliability, performance, accessibility and regional usefulness as data access, infrastructure and product capabilities mature."
      ]},
      { heading: "Our principles", bullets: [
        "Transparency: disclose data providers, limitations, update times and unavailable integrations.",
        "Safety first: do not present a general-purpose weather website as an official warning authority.",
        "Accessibility: keep information readable and usable across common devices and connection conditions.",
        "Responsible technology: request location only through browser permission and use it for the weather experience.",
        "Continuous improvement: test changes before deployment and preserve existing working features."
      ]},
      { heading: "What success means", paragraphs: [
        "Success is not the number of animations or the amount of information on a page. It is whether people can quickly understand the weather report, assess its source and freshness, and find the official authority they should follow when safety is involved."
      ]}
    ]
  },
  "our-story": {
    eyebrow: "COMPANY · OUR STORY",
    title: "Built to make the weather easier to understand.",
    lead: "EARTH WEATHER began as a project to bring local weather and global weather awareness into a clear, approachable website.",
    sections: [
      { heading: "The idea", paragraphs: [
        "The central idea is simple: weather information is most useful when local conditions, wider regional context, global events and source information can be explored without confusion.",
        "The experience has been shaped around a location-aware weather report, city comparison cards, weather-only news, satellite imagery and public severe-weather event information."
      ]},
      { heading: "How the platform is built", bullets: [
        "A React and TypeScript web frontend provides the user experience.",
        "A FastAPI backend retrieves and normalises weather information from its configured providers.",
        "Firebase Hosting serves the website, while the weather API runs as a separate backend service.",
        "The site uses browser geolocation only after permission, and supports place search when a visitor does not wish to share device location."
      ]},
      { heading: "A transparent development path", paragraphs: [
        "The platform is still evolving. Some providers are active integrations; others are catalogued as possible sources but require credentials, permissions, licensing or additional engineering before they can be described as connected.",
        "We prefer to publish those limits openly rather than imply that a planned integration is already operational."
      ]},
      { heading: "The people behind it", paragraphs: [
        "Founder: Mohammed Riyash B. Project identity: BMR INC. Additional leadership and team biographies will be published only when confirmed details are available."
      ]}
    ]
  },
  careers: {
    eyebrow: "COMPANY · CAREERS",
    title: "Build better weather experiences with us.",
    lead: "EARTH WEATHER is an evolving product. This page will list genuine openings when the team is ready to recruit.",
    sections: [
      { heading: "Current opportunities", paragraphs: [
        "There are no verified open positions or active recruitment campaigns published at this time. Please do not send identity documents, bank details or payment to anyone claiming to recruit on behalf of EARTH WEATHER."
      ]},
      { heading: "Areas that may grow", bullets: [
        "Frontend engineering and accessible interface design.",
        "Weather data engineering, verification and scientific communication.",
        "Satellite imagery and geospatial engineering.",
        "Weather journalism, editorial research and localisation.",
        "Quality assurance, security and platform operations."
      ]},
      { heading: "Stay informed", paragraphs: [
        "When a role is officially opened, this page will describe the responsibilities, eligibility, application method and closing date. An area of interest is not a current vacancy or promise of employment."
      ], links: [
        { label: "EARTH WEATHER project repository", href: "https://github.com/MohammedRiyashB/earthweatherchannel" }
      ]}
    ]
  },
  "press-media": {
    eyebrow: "COMPANY · PRESS & MEDIA",
    title: "Press and media information.",
    lead: "A clear reference point for journalists, publishers and people covering the EARTH WEATHER project.",
    sections: [
      { heading: "Project description", paragraphs: [
        "EARTH WEATHER CHANNEL is a developing weather-information platform from BMR INC. It brings together location-based weather reports, selected city conditions, weather-related news feeds, public satellite imagery products and curated natural-event metadata."
      ]},
      { heading: "Approved facts for publication", bullets: [
        "Website: https://earthweatherchannel.web.app/",
        "Project identity: EARTH WEATHER CHANNEL · BMR INC.",
        "Founder: Mohammed Riyash B.",
        "The current weather service uses Open-Meteo as its primary model-data provider and MET Norway as fallback.",
        "Satellite and event features have product-specific coverage and limitations; the site is not an official warning authority."
      ]},
      { heading: "Media assets and enquiries", paragraphs: [
        "The website logo is the current brand asset. A downloadable press kit, media email, spokesperson schedule and press office address have not yet been published. We will add them when verified and approved."
      ], links: [
        { label: "Official website", href: "https://earthweatherchannel.web.app/" },
        { label: "Public project repository", href: "https://github.com/MohammedRiyashB/earthweatherchannel" }
      ]}
    ]
  },
  contact: {
    eyebrow: "COMPANY · CONTACT",
    title: "Get in touch with EARTH WEATHER.",
    lead: "We welcome useful questions, product feedback and clear reports about website problems or weather information.",
    sections: [
      { heading: "Current public contact channel", paragraphs: [
        "A dedicated company email address, telephone number and postal address have not been provided for publication. To avoid inventing contact details, the public project issue tracker is the currently verifiable channel for website and product enquiries."
      ], links: [
        { label: "Open the EARTH WEATHER issue tracker", href: "https://github.com/MohammedRiyashB/earthweatherchannel/issues", description: "Public GitHub repository issue tracker." }
      ]},
      { heading: "Choose the right enquiry", bullets: [
        "Website problem: describe the page, browser/device and steps that reproduce it.",
        "Weather-data concern: include the place, metric, displayed time and the official source you compared against.",
        "Privacy or account concern: do not post personal or authentication information publicly; use the platform's private account controls and official provider channels.",
        "Media or partnership enquiry: identify the organisation and the specific subject."
      ]},
      { heading: "Please do not send", bullets: [
        "Passwords, one-time codes, API keys, private access tokens or bank details.",
        "Identity documents or precise home-location information unless it is genuinely necessary and you are using an appropriate private channel."
      ]}
    ]
  },
  "weather-reports": {
    eyebrow: "RESOURCES · WEATHER REPORTS",
    title: "Understand the weather report.",
    lead: "EARTH WEATHER presents current conditions and selected city reports using the provider and time information returned by its weather service.",
    sections: [
      { heading: "What a current report can include", bullets: [
        "Air temperature in degrees Celsius.",
        "Relative humidity and cloud-cover percentage.",
        "Wind speed and direction where returned by the provider.",
        "Weather condition codes translated into readable descriptions.",
        "A retrieval or model timestamp when supplied by the provider."
      ]},
      { heading: "Location and city reports", paragraphs: [
        "Visitors can allow browser location access or search for a city or region. The site may show selected national, nearby regional and international reference cities based on the detected or selected country.",
        "A city card is a report for that city's reference coordinates. It is not a guarantee that every neighbourhood or nearby weather station has exactly the same conditions."
      ]},
      { heading: "How to read the values", paragraphs: [
        "Current values are primarily numerical weather-model analysis rather than direct measurements from a sensor installed at the exact browser location. Provider, model grid resolution, terrain, update cycle and local weather variability can affect the result.",
        "Always check the observation or retrieval time. A page refresh does not make an upstream model update instantly."
      ]},
      { heading: "Data quality and limits", paragraphs: [
        "If the provider is unavailable, a field may be missing or the service may return an error. The site should not invent a value to fill a gap. Official local observations and warnings should take precedence for operational decisions."
      ], links: [
        { label: "Open-Meteo documentation", href: "https://open-meteo.com/en/docs" },
        { label: "MET Norway Locationforecast documentation", href: "https://api.met.no/weatherapi/locationforecast/2.0/documentation" }
      ]}
    ]
  },
  "global-weather-news": {
    eyebrow: "RESOURCES · GLOBAL WEATHER NEWS",
    title: "Weather-related news from public sources.",
    lead: "The newsroom filters selected public feeds for weather, climate, earth science and official alert content. Articles remain the property of their publishers.",
    sections: [
      { heading: "India: official public alerts", paragraphs: [
        "For India-focused country, state and local news tabs, the backend reads public RSS/CAP feeds from NDMA SACHET. These are official alert publications and may contain warnings from the issuing authorities. Regional feed availability and publication times can vary."
      ], links: [
        { label: "NDMA SACHET National Disaster Alert Portal", href: "https://sachet.ndma.gov.in/" }
      ]},
      { heading: "Global: Earth science and weather stories", paragraphs: [
        "The world feed retrieves weather-related items from NASA Earth Science and NOAA RSS sources. A keyword filter is used to keep the feed focused on weather and earth-science topics. The feed is not a substitute for a full news wire or a comprehensive global disaster-warning service."
      ], links: [
        { label: "NASA RSS feeds", href: "https://www.nasa.gov/rss-feeds/" },
        { label: "NOAA", href: "https://www.noaa.gov/" }
      ]},
      { heading: "Publisher rights and article access", paragraphs: [
        "Headlines, excerpts, thumbnails and links may be provided by publishers or feeds. Availability, language, images, article text and update intervals depend on each publisher. Where available, the original publisher link is the authoritative location for the complete story.",
        "EARTH WEATHER does not claim to own third-party journalism and does not imply that a publisher endorses this website."
      ]}
    ]
  },
  "weather-data-sources": {
    eyebrow: "RESOURCES · DATA TRANSPARENCY",
    title: "Weather and earth-observation data sources.",
    lead: "This page separates active integrations from sources that are listed for reference or require additional access. A provider being listed is not proof that every one of its products is live in EARTH WEATHER.",
    sections: [
      { heading: "Active current-weather providers", bullets: [
        "Open-Meteo — primary provider for current numerical weather-model fields. The platform requests temperature, relative humidity, apparent temperature, day/night flag, precipitation, weather code, cloud cover, pressure and wind fields.",
        "MET Norway Locationforecast — fallback provider when Open-Meteo is unavailable or rate-limited. Returned values are labelled with their actual source and cached according to provider instructions."
      ], links: [
        { label: "Open-Meteo API documentation", href: "https://open-meteo.com/en/docs" },
        { label: "Open-Meteo terms and data licence", href: "https://github.com/open-meteo/open-meteo" },
        { label: "MET Norway Locationforecast documentation", href: "https://api.met.no/weatherapi/locationforecast/2.0/documentation" },
        { label: "MET Norway Terms of Service", href: "https://api.met.no/doc/TermsOfService" }
      ], note: "Open-Meteo states that its free hosted API is for open-source and non-commercial use and asks commercial users to contact it. Because this site includes an advertising tag, its intended use and provider permission should be reviewed before commercial operation."},
      { heading: "Connected imagery, events and radar", bullets: [
        "NASA EOSDIS GIBS — live machine-readable imagery layer catalogue and public WMTS imagery; layer, date, product coverage and latency vary.",
        "NASA EONET — curated natural-event metadata, including severe-storm event information. It is not a complete cyclone tracker or official warning feed.",
        "RainViewer — historical radar frames where coverage is available. Coverage is patchy and the current integration is not a nowcast service."
      ], links: [
        { label: "NASA GIBS", href: "https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs" },
        { label: "NASA EONET API documentation", href: "https://eonet.gsfc.nasa.gov/docs/v3" },
        { label: "RainViewer API", href: "https://www.rainviewer.com/api.html" }
      ]},
      { heading: "News and public-alert feeds", bullets: [
        "NDMA SACHET — India-focused public RSS/CAP alert feed integration.",
        "NASA Earth Science and NOAA — global RSS sources filtered for weather and Earth-science stories.",
        "NOAA/National Weather Service — an alert endpoint is implemented for the United States only; it is not a global warnings feed."
      ], links: [
        { label: "NDMA SACHET", href: "https://sachet.ndma.gov.in/" },
        { label: "NASA RSS feeds", href: "https://www.nasa.gov/rss-feeds/" },
        { label: "NOAA/NWS alerts documentation", href: "https://www.weather.gov/documentation/services-web-alerts" }
      ]},
      { heading: "Maps and place search", bullets: [
        "OpenStreetMap — community-maintained map data and basemap attribution.",
        "Nominatim — OpenStreetMap's place-search/reverse-geocoding service used by the website. Its public service has a usage policy and is not an unlimited geocoding platform."
      ], links: [
        { label: "OpenStreetMap copyright and attribution", href: "https://www.openstreetmap.org/copyright" },
        { label: "Nominatim usage policy", href: "https://operations.osmfoundation.org/policies/nominatim/" }
      ]},
      { heading: "Catalogue entries that are not yet full live integrations", bullets: [
        "India Meteorological Department (IMD) API products require registered access/credentials; the current backend identifies the official portal but does not claim its authenticated cyclone and warning feeds are connected.",
        "JMA Himawari, Copernicus Data Space, USGS/NASA Landsat and commercial imagery providers are catalogued as possible sources with product, access or licence requirements. They are not all active direct weather feeds.",
        "NASA MODIS cloud-fraction and GPM IMERG numerical retrievals require an authenticated data-granule/subset adapter. Until implemented, the website does not substitute model values and label them satellite measurements."
      ], links: [
        { label: "IMD API portal", href: "https://api.imd.gov.in/public/" },
        { label: "IMD API reference", href: "https://api.imd.gov.in/public/api_reference.html" },
        { label: "Copernicus Data Space", href: "https://dataspace.copernicus.eu/" },
        { label: "USGS Landsat missions", href: "https://www.usgs.gov/landsat-missions" }
      ]},
      { heading: "Attribution and availability", paragraphs: [
        "Open-Meteo data are offered under CC BY 4.0 with attribution requirements. MET Norway open data also requires appropriate attribution. OpenStreetMap data are under the ODbL and require visible attribution. Third-party products have their own terms, licences and service limits.",
        "A green provider health indicator means that a lightweight endpoint check responded. It does not certify scientific accuracy, freshness of every field, global coverage or a service-level guarantee."
      ], links: [
        { label: "Creative Commons Attribution 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
        { label: "OpenStreetMap copyright", href: "https://www.openstreetmap.org/copyright" }
      ]}
    ]
  },
  "weather-alerts-safety": {
    eyebrow: "RESOURCES · WEATHER ALERTS & SAFETY",
    title: "Use official warnings for safety decisions.",
    lead: "EARTH WEATHER can help you discover weather information, but the issuing meteorological or disaster-management authority is the source to follow during an emergency.",
    sections: [
      { heading: "India", paragraphs: [
        "The website uses NDMA SACHET public RSS/CAP alerts for India-focused alert and news views. For official forecasts, district warnings, cyclone bulletins, coastal warnings and other operational products, consult the India Meteorological Department directly.",
        "SACHET and IMD are separate official resources with different roles. A story or event shown on EARTH WEATHER may not be a complete list of active warnings for your exact location."
      ], links: [
        { label: "NDMA SACHET alerts", href: "https://sachet.ndma.gov.in/" },
        { label: "IMD Mausam forecasts and warnings", href: "https://mausam.imd.gov.in/index_en.php" },
        { label: "IMD official API portal", href: "https://api.imd.gov.in/public/" }
      ]},
      { heading: "United States", paragraphs: [
        "The backend includes a NOAA/National Weather Service alert endpoint for the United States. Its coverage is limited to the NWS service area; it must not be interpreted as a worldwide warning service."
      ], links: [
        { label: "National Weather Service active alerts", href: "https://www.weather.gov/documentation/services-web-alerts" }
      ]},
      { heading: "Other countries", paragraphs: [
        "Follow your country's national meteorological service, local disaster-management agency and emergency authorities. Their warnings, instructions and evacuation notices take priority over third-party apps and general forecasts."
      ]},
      { heading: "Practical safety guidance", bullets: [
        "Read the warning level, affected area, issue time and valid-until time—not just the headline.",
        "During thunderstorms, move indoors and stay away from open fields, isolated trees, water and exposed metal structures.",
        "During floods, do not walk, swim or drive through floodwater. Follow evacuation instructions and official route guidance.",
        "During cyclones or severe wind, follow official shelter, coastal evacuation and travel restrictions.",
        "Keep emergency supplies, essential medicines, charged phones and local emergency contacts ready where severe weather is possible."
      ]},
      { heading: "How EARTH WEATHER labels events", paragraphs: [
        "NASA EONET is a curated natural-event metadata service. An EONET event is not an official warning, may be delayed or incomplete, and should never replace IMD, NDMA, NWS or another responsible authority's bulletin."
      ], links: [
        { label: "NASA EONET documentation", href: "https://eonet.gsfc.nasa.gov/docs/v3" }
      ]}
    ]
  },
  "weather-glossary": {
    eyebrow: "RESOURCES · WEATHER GLOSSARY",
    title: "Weather terms, explained simply.",
    lead: "A quick reference to the terms used in EARTH WEATHER reports and data displays.",
    sections: [
      { heading: "Current conditions", bullets: [
        "Air temperature: the reported air temperature at the model or observation reference point.",
        "Feels-like temperature: an estimate of how hot or cold conditions may feel after relevant factors such as wind or humidity are considered.",
        "Relative humidity: the percentage describing how close the air is to saturation at its current temperature.",
        "Cloud cover: the estimated fraction of the sky covered by clouds, expressed as a percentage.",
        "Wind speed: how fast air is moving, shown in km/h on the website.",
        "Wind gust: a short-lived increase in wind speed above the more sustained wind.",
        "Precipitation: water falling from the atmosphere, including rain, snow, sleet or hail depending on conditions."
      ]},
      { heading: "Forecasts and data", bullets: [
        "Weather forecast: an estimate of future atmospheric conditions for a place and time.",
        "Numerical weather model: a computer simulation of the atmosphere based on physical equations, observations and initial conditions.",
        "Model analysis: a provider's best estimate of current conditions produced by combining model information and available observations.",
        "Observation time: the timestamp attached to a report or model product.",
        "Radar: a remote-sensing system that detects precipitation-related signals; coverage and product availability vary.",
        "Satellite imagery: visual products derived from instruments aboard satellites. Different channels show different properties and have different acquisition times.",
        "Nowcast: a very short-range forecast, often covering the next few hours."
      ]},
      { heading: "Warnings and events", bullets: [
        "Watch: conditions may become favourable for a hazardous event; be prepared.",
        "Warning: a hazardous event is occurring, imminent or expected; take the actions specified by the issuing authority.",
        "Advisory: an official notice of conditions that may cause inconvenience or risk and require attention.",
        "CAP: Common Alerting Protocol, a standard format used to exchange emergency alerts.",
        "EONET event: a curated natural-event record; it is not automatically an official public warning."
      ]}
    ]
  },
  "help-center": {
    eyebrow: "RESOURCES · HELP CENTER",
    title: "Help using EARTH WEATHER.",
    lead: "Find quick guidance for location, search, weather reports, news, alerts and the satellite experience.",
    sections: [
      { heading: "Find weather for your location", bullets: [
        "Open Weather Report and allow location access in your browser when prompted.",
        "If you do not want to share device location, enter a city or region in the search field.",
        "If location access was denied, change the permission in your browser's site settings and reload the website."
      ]},
      { heading: "Understand a city card", bullets: [
        "Check the city name and region first.",
        "Review temperature, humidity, wind and cloud-cover values.",
        "Check the timestamp and provider/source details where shown.",
        "Remember that the card is a model-based reference report, not a reading from every street or neighbourhood."
      ]},
      { heading: "Notifications", paragraphs: [
        "Browser notifications require your permission. The website can only show them when the browser grants permission and the device/browser notification settings allow them. You can revoke permission in site settings."
      ]},
      { heading: "Satellite and radar views", paragraphs: [
        "Satellite layers have product-specific coverage and acquisition times. Historical RainViewer radar frames are available only where the provider has coverage; the current integration is not a global precipitation nowcast."
      ]},
      { heading: "Need further help?", paragraphs: [
        "Use the Report an Issue page for a reproducible website problem, or Report Weather Data for a place/metric/time discrepancy. Do not post passwords, one-time codes or API keys."
      ], links: [
        { label: "Contact Support", href: "/contact-support" },
        { label: "Frequently Asked Questions", href: "/faq" }
      ]}
    ]
  },
  faq: {
    eyebrow: "RESOURCES · FREQUENTLY ASKED QUESTIONS",
    title: "Frequently asked questions.",
    lead: "Answers to common questions about the website's weather data, location features and limitations.",
    sections: [
      { heading: "Is the temperature measured by a sensor at my exact location?", paragraphs: [
        "Not necessarily. The current weather fields are primarily numerical weather-model analysis from the configured provider. A city card is a reference point, not a guarantee of street-level conditions."
      ]},
      { heading: "Why can another weather app show a different value?", paragraphs: [
        "Services can use different providers, model grids, observation stations, update cycles, time zones and rounding rules. Compare the place, timestamp, metric and units before treating two values as directly equivalent."
      ]},
      { heading: "Does allowing location access make it compulsory to sign in?", paragraphs: [
        "No. Browser location permission and Google sign-in are separate. Weather and city search can be used without signing in."
      ]},
      { heading: "Does EARTH WEATHER provide official cyclone warnings in India?", paragraphs: [
        "The website links to IMD and displays NDMA SACHET public feeds. The IMD authenticated cyclone API is not currently described as a connected live integration. Always follow IMD and NDMA directly."
      ]},
      { heading: "Are satellite cloud values used for the temperature card?", paragraphs: [
        "No. Current temperature, humidity, wind and cloud-cover values are labelled as weather-model data. NASA imagery is presented separately. Satellite-derived MODIS/GPM numeric retrievals require additional authenticated processing that is not yet complete."
      ]},
      { heading: "Why is radar not available for every place?", paragraphs: [
        "RainViewer radar coverage is regional and incomplete. The integration shows historical frames where available and is not a guaranteed global nowcast."
      ]},
      { heading: "Why do notifications not appear?", paragraphs: [
        "Check browser notification permission, Android app/site notification settings, device Do Not Disturb settings and whether the browser is allowed to run. Notifications cannot be guaranteed when the operating system restricts the browser."
      ]},
      { heading: "How can I report an incorrect value?", paragraphs: [
        "Use Report Weather Data and include the place, metric, units, displayed timestamp, screenshot if possible and a link to an official comparison source. Do not include private account information."
      ]}
    ]
  },
  "terms-and-conditions": {
    eyebrow: "LEGAL · TERMS & CONDITIONS",
    title: "Terms and Conditions.",
    lead: "These terms describe the basic conditions for accessing and using EARTH WEATHER CHANNEL. Please read them with the Privacy Policy, Cookie Policy and Disclaimer.",
    sections: [
      { heading: "1. About the service", paragraphs: [
        "EARTH WEATHER CHANNEL is a weather-information website presented under the BMR INC. project identity. The website brings together current model-based weather information, selected city reports, weather-related feeds, imagery products and event metadata. Features may change as the service develops."
      ]},
      { heading: "2. Acceptance and responsible use", paragraphs: [
        "By accessing the website, you agree to use it lawfully and responsibly. You must not attempt unauthorised access, interfere with service availability, abuse upstream providers, scrape or overload the service, reverse engineer restricted systems, or use the website to distribute unlawful or harmful material."
      ]},
      { heading: "3. Weather information and safety", paragraphs: [
        "Weather data, forecasts, model outputs, satellite imagery, radar frames, news feeds and event metadata may be delayed, incomplete, unavailable or inaccurate for a particular place or time. The website is for general information only and is not an emergency-warning authority, professional meteorological service or guarantee of local conditions.",
        "You must consult the responsible official authority for warnings, evacuation instructions and decisions involving life, health or property."
      ]},
      { heading: "4. Third-party services and content", paragraphs: [
        "The website relies on external providers, including weather services, mapping/geocoding services, satellite imagery providers, news publishers, advertising services and authentication services. Their own terms, licences, availability rules and privacy policies apply to their services.",
        "Third-party names, marks, datasets, articles and imagery remain subject to their respective rights and terms. A link or data display does not imply endorsement."
      ]},
      { heading: "5. Intellectual property and permitted use", paragraphs: [
        "Unless otherwise stated, the website's original presentation, text, code and brand assets are intended for use as part of EARTH WEATHER. You may not reproduce or commercially exploit original content or branding without permission, except where applicable law or a published third-party licence allows it."
      ]},
      { heading: "6. Availability and changes", paragraphs: [
        "We may update, suspend or remove a feature to maintain security, reliability, provider compliance or product quality. No uninterrupted or error-free service is promised. We may revise these terms and publish the updated version on this page."
      ]},
      { heading: "7. Limitation and governing law", paragraphs: [
        "To the extent permitted by applicable law, the service is provided on an as-available basis without a guarantee that every report or product is complete, current or fit for a particular decision. Nothing in these terms excludes rights or liabilities that cannot lawfully be excluded.",
        "Any governing-law or jurisdiction provision should be finalised after the operating entity's legal status and registered place of business are confirmed. This website does not publish an unverified registered address or jurisdiction."
      ]},
      { heading: "8. Contact", paragraphs: [
        "For questions about these terms, use the public EARTH WEATHER project issue tracker. Do not submit passwords, private tokens or sensitive personal information in a public issue."
      ], links: [
        { label: "EARTH WEATHER issue tracker", href: "https://github.com/MohammedRiyashB/earthweatherchannel/issues" }
      ]}
    ]
  },
  "privacy-policy": {
    eyebrow: "LEGAL · PRIVACY POLICY",
    title: "Privacy Policy.",
    lead: "This notice explains the information flows visible in the current EARTH WEATHER website implementation. It should be reviewed and updated whenever the website adds or changes data collection, advertising, analytics or account features.",
    sections: [
      { heading: "1. Information processed", bullets: [
        "Location: if you grant browser permission, the device's latitude and longitude are used to request weather for the selected location.",
        "Place search: a city or region search is sent to the OpenStreetMap Nominatim geocoding service to find coordinates; the resulting coordinates are used for a weather request.",
        "Local browser storage: the website stores cached weather/city results, the selected location and notification preferences/snapshots in localStorage so the page can restore recent display state.",
        "Notifications: if browser permission is granted, the site stores a local notification preference and a small snapshot of recent weather conditions to decide whether a meaningful change has occurred.",
        "Optional Google sign-in: if you choose to sign in, Firebase Authentication handles the Google authentication flow. The weather experience does not require sign-in."
      ]},
      { heading: "2. How location is used", paragraphs: [
        "Location is requested through the browser's geolocation permission. If granted, coordinates are sent to the EARTH WEATHER backend to retrieve weather data. The backend forwards the coordinates to the configured weather provider. If you use place search, the search text is sent to Nominatim and the resulting coordinates are sent to the weather backend.",
        "You can deny location access and use manual city search. You can revoke permission through your browser or device site settings."
      ]},
      { heading: "3. Weather and third-party providers", paragraphs: [
        "The backend currently uses Open-Meteo as its primary current-weather model provider and MET Norway as fallback. The website also connects to NASA GIBS imagery metadata, NASA EONET event metadata, RainViewer historical radar metadata, NDMA SACHET alert feeds, NASA Earth Science and NOAA RSS sources, and OpenStreetMap/Nominatim services.",
        "Those services receive requests needed to provide their data. Their processing is governed by their own terms and privacy notices."
      ]},
      { heading: "4. Authentication", paragraphs: [
        "Google sign-in is optional and handled through Firebase Authentication. EARTH WEATHER does not ask you to create or submit a separate website password in the current implementation. Google and Firebase process authentication information under their own policies."
      ], links: [
        { label: "Firebase privacy and security", href: "https://firebase.google.com/support/privacy" },
        { label: "Google Privacy Policy", href: "https://policies.google.com/privacy" }
      ]},
      { heading: "5. Advertising and cookies", paragraphs: [
        "The website currently includes the Google AdSense advertising script. When advertising requests or ad content are served, Google and its advertising partners may use cookies, IP addresses or other identifiers for ad delivery, frequency control, measurement and related purposes, depending on browser and account settings.",
        "See the separate Cookie Policy and Google's publisher disclosures for more information. The exact cookies and partners may vary by region, consent state and ad delivery."
      ], links: [
        { label: "How AdSense uses cookies", href: "https://support.google.com/adsense/answer/7549925?hl=en" },
        { label: "Google publisher privacy disclosures", href: "https://support.google.com/publisherpolicies/answer/10437794?hl=en" }
      ]},
      { heading: "6. Server and security information", paragraphs: [
        "The website is delivered through Firebase Hosting and its weather API is hosted separately. Hosting, backend and connected service providers may process technical request information, such as IP addresses, timestamps, browser details and error/security logs, as part of operating and protecting their services. Exact retention periods depend on those providers and their service settings."
      ]},
      { heading: "7. Your choices", bullets: [
        "Use manual search instead of granting browser location access.",
        "Revoke location or notification permission in browser/device settings.",
        "Sign out of Google sign-in where the account control is shown.",
        "Clear site data in your browser to remove local weather and preference caches.",
        "Use Google account and advertising settings to review available personalisation choices."
      ]},
      { heading: "8. Children's privacy and policy updates", paragraphs: [
        "The website is not designed as a service for children to submit personal information. If a parent or guardian believes a child has provided information through a connected service, they should contact the relevant service provider and use the public support channel for a website-related concern.",
        "This notice may change when integrations or applicable legal requirements change. The live page should be checked for the latest version."
      ]},
      { heading: "9. India privacy framework", paragraphs: [
        "Where applicable, personal-data processing is subject to relevant privacy laws, including India's Digital Personal Data Protection Act, 2023 and the notified Rules. This page is a plain-language product notice, not a legal opinion or certification of compliance; the operator should obtain a legal review before commercial launch."
      ], links: [
        { label: "Digital Personal Data Protection Act, 2023 — India Code", href: "https://www.indiacode.nic.in/indiacode/handle/123456789/22037?view_type=browse" },
        { label: "MeitY DPDP Rules, 2025", href: "https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025-2" }
      ]}
    ]
  },
  "cookie-policy": {
    eyebrow: "LEGAL · COOKIE POLICY",
    title: "Cookie and local-storage policy.",
    lead: "EARTH WEATHER uses browser storage for website functionality and includes a Google AdSense script. Cookies and localStorage are different technologies and are described separately below.",
    sections: [
      { heading: "1. Local storage used by the website", paragraphs: [
        "The frontend uses browser localStorage to cache weather and city data, preserve a recent selected location, and remember notification preference and the last weather snapshot used for change detection. This storage is held by the browser on your device; it is not the same as a server-side account database."
      ]},
      { heading: "2. Advertising cookies", paragraphs: [
        "The website includes the Google AdSense script. When ad requests or ad content are served, Google may use cookies and similar technologies to support advertising, frequency capping, measurement and related functions. The specific cookies can vary based on ad delivery, region, consent settings and browser configuration."
      ], links: [
        { label: "Google: How AdSense uses cookies", href: "https://support.google.com/adsense/answer/7549925?hl=en" },
        { label: "Google advertising cookie information", href: "https://business.safety.google/adscookies/" }
      ]},
      { heading: "3. Authentication storage", paragraphs: [
        "If you choose Google sign-in, Firebase Authentication may use browser storage to maintain the authentication session according to its SDK and browser settings. Google and Firebase publish their own privacy and service information."
      ], links: [
        { label: "Firebase privacy and security", href: "https://firebase.google.com/support/privacy" }
      ]},
      { heading: "4. Your controls", bullets: [
        "Use your browser settings to block, clear or restrict cookies and site storage.",
        "Changing browser storage settings can remove saved locations, cached reports and notification preferences.",
        "Use Google's Ads Settings to review available advertising-personalisation controls.",
        "Blocking essential site storage or scripts may affect parts of the website."
      ]},
      { heading: "5. Updates", paragraphs: [
        "The list of technologies may change when new services are introduced. This page should be updated whenever a new analytics, advertising, payment or embedded service is added."
      ]}
    ]
  },
  disclaimer: {
    eyebrow: "LEGAL · WEATHER DISCLAIMER",
    title: "Weather and information disclaimer.",
    lead: "Weather information is useful for planning, but no digital report can guarantee the exact conditions at every place and moment.",
    sections: [
      { heading: "Forecasts and model data", paragraphs: [
        "Current conditions and forecasts may be model-derived, interpolated, delayed, revised or unavailable. Local terrain, coastlines, urban effects, rapidly changing storms and provider update cycles can cause differences between a report and conditions observed nearby."
      ]},
      { heading: "Satellite imagery and radar", paragraphs: [
        "Satellite products vary by sensor, channel, acquisition time, processing and geographic coverage. A satellite image is not a direct measurement of every weather value displayed in a city card. Historical radar tiles are not a guaranteed nowcast."
      ]},
      { heading: "Events and warnings", paragraphs: [
        "NASA EONET provides curated natural-event metadata and is not a complete tropical-cyclone tracker or official warning authority. India alert feeds, US NWS alerts and other sources have separate geographic scope and update characteristics."
      ]},
      { heading: "Emergency and professional decisions", paragraphs: [
        "Do not rely solely on EARTH WEATHER for evacuation, travel, marine, aviation, agricultural, medical, engineering, financial or other safety-critical decisions. Follow the latest instructions from the responsible official authority and qualified professionals."
      ], links: [
        { label: "India Meteorological Department", href: "https://mausam.imd.gov.in/index_en.php" },
        { label: "NDMA SACHET", href: "https://sachet.ndma.gov.in/" },
        { label: "NOAA/NWS alerts", href: "https://www.weather.gov/documentation/services-web-alerts" }
      ]},
      { heading: "No endorsement", paragraphs: [
        "Third-party data, links, names and logos are identified for attribution and reference. Their appearance does not mean the provider endorses EARTH WEATHER or guarantees the website's interpretation."
      ]}
    ]
  },
  "data-usage-policy": {
    eyebrow: "LEGAL · DATA USAGE POLICY",
    title: "How weather and location data are used.",
    lead: "This policy explains the intended use of data returned to and displayed by EARTH WEATHER, and the limits that apply to third-party information.",
    sections: [
      { heading: "1. Purpose", paragraphs: [
        "Weather and location data are used to retrieve and display the report for a selected place, compare selected city reference points, provide weather-related news context and support the site's satellite/radar experiences."
      ]},
      { heading: "2. Model values are not satellite observations", paragraphs: [
        "Temperature, humidity, wind, cloud cover and precipitation fields in the current weather report are obtained from the configured numerical weather providers. The platform labels these as model or provider data. Satellite imagery products are shown separately, and no satellite measurement is invented to fill a missing weather field."
      ]},
      { heading: "3. Source selection and failover", paragraphs: [
        "The forecast backend uses MET Norway Locationforecast as its primary global model source and falls back to Open-Meteo when MET Norway data is unavailable or invalid. Open-Meteo may also supplement selected fields. The selected provider is included in response metadata where available. A fallback is a different model/provider, not a guarantee that two sources will agree."
      ]},
      { heading: "4. Refresh and caching", paragraphs: [
        "The frontend periodically requests updated forecast data (about every five minutes while the weather view is open) and refreshes available RainViewer radar metadata on its provider cadence (about every ten minutes). These requests do not force upstream providers to generate new observations: MET Norway data is cached in accordance with its minimum three-hour request interval, CAMS air-quality guidance updates on a slower model cycle, and RainViewer supplies past radar frames rather than a live nowcast. NASA GIBS imagery is product-dependent and may be daily or near-real-time. Provider-side update schedules therefore determine actual data freshness."
      ]},
      { heading: "5. Third-party licences and attribution", paragraphs: [
        "Users and downstream developers must follow the licence, attribution, usage and redistribution terms of each upstream data source. Open-Meteo attribution, MET Norway attribution and OpenStreetMap attribution/ODbL requirements are particularly relevant to current integrations."
      ], links: [
        { label: "Open-Meteo data licence and terms", href: "https://github.com/open-meteo/open-meteo" },
        { label: "MET Norway Terms of Service", href: "https://api.met.no/doc/TermsOfService" },
        { label: "OpenStreetMap copyright and licence", href: "https://www.openstreetmap.org/copyright" }
      ]},
      { heading: "6. Developer and commercial use", paragraphs: [
        "The site does not currently publish a public developer API product or an API service-level agreement. Do not assume that website data or upstream endpoints may be bulk-copied, resold or used commercially without checking each provider's current terms and obtaining any required permission."
      ]}
    ]
  },
  "copyright-policy": {
    eyebrow: "LEGAL · COPYRIGHT POLICY",
    title: "Copyright, attribution and permitted use.",
    lead: "EARTH WEATHER combines original website elements with information and media supplied by third-party providers. Each category has its own rights and licence conditions.",
    sections: [
      { heading: "EARTH WEATHER original materials", paragraphs: [
        "The EARTH WEATHER name, logo artwork, original page design, original text and original software elements are presented as part of the EARTH WEATHER CHANNEL / BMR INC. project. No statement on this page claims a registered trademark or copyright registration unless separately published."
      ]},
      { heading: "Third-party data and imagery", paragraphs: [
        "Open-Meteo data are offered under CC BY 4.0 and require appropriate attribution. OpenStreetMap data are under the ODbL and require credit and licence notice. MET Norway open data require attribution. NASA, NOAA, RainViewer, news publishers and other providers may have product-specific terms, marks and reuse conditions."
      ], links: [
        { label: "Creative Commons Attribution 4.0", href: "https://creativecommons.org/licenses/by/4.0/" },
        { label: "OpenStreetMap copyright", href: "https://www.openstreetmap.org/copyright" },
        { label: "India Copyright Office", href: "https://www.copyright.gov.in/" }
      ]},
      { heading: "Articles and publisher material", paragraphs: [
        "News headlines, summaries, excerpts, links and images remain subject to the publisher's copyright and syndication terms. Use the original publisher page for full articles and follow that publisher's reuse requirements."
      ]},
      { heading: "Report a copyright concern", paragraphs: [
        "If you believe original content on the website infringes your rights, submit a public issue with the page URL, a description of the material and a way to verify your authority. Do not post identity documents, private correspondence or confidential material publicly. A private rights-holder contact channel will be published when available."
      ], links: [
        { label: "Open project issue tracker", href: "https://github.com/MohammedRiyashB/earthweatherchannel/issues" }
      ]}
    ]
  },
  "contact-support": {
    eyebrow: "SUPPORT · CONTACT SUPPORT",
    title: "EARTH WEATHER support.",
    lead: "For help with the website, use the public issue tracker. A separate support email address or live support desk has not been published.",
    sections: [
      { heading: "Before contacting support", bullets: [
        "Check the Help Center and FAQ pages.",
        "Refresh the website once and note the date, time, page and browser.",
        "For a weather discrepancy, record the exact place, metric, unit, displayed timestamp and comparison source.",
        "For an account issue, describe the sign-in step that failed without sharing your password or one-time code."
      ]},
      { heading: "Open a support request", paragraphs: [
        "The public GitHub issue tracker is the current verifiable channel for website bugs and product requests. Public issues can be visible to anyone, so remove personal details and secrets before submitting."
      ], links: [
        { label: "Open EARTH WEATHER issues", href: "https://github.com/MohammedRiyashB/earthweatherchannel/issues" }
      ]},
      { heading: "What support cannot guarantee", paragraphs: [
        "The issue tracker is not an emergency channel and has no published response-time commitment. For urgent weather hazards, use your official local emergency and meteorological authority."
      ], links: [
        { label: "Weather Alerts & Safety", href: "/weather-alerts-safety" }
      ]}
    ]
  },
  "report-issue": {
    eyebrow: "SUPPORT · REPORT AN ISSUE",
    title: "Report a website problem.",
    lead: "A clear, reproducible report helps the team identify and fix a website problem without exposing your private information.",
    sections: [
      { heading: "Include these details", bullets: [
        "The exact page URL and the time the problem happened, including your time zone.",
        "Device model, operating system and browser version.",
        "What you expected to happen and what actually happened.",
        "Steps to reproduce the problem and a screenshot or screen recording if safe to share.",
        "Whether refreshing the page or using another browser changes the result."
      ]},
      { heading: "Protect your information", paragraphs: [
        "Never attach passwords, one-time codes, API keys, service-account files, private account identifiers or personal documents. Blur names, addresses and exact GPS coordinates if they are not required to reproduce the issue."
      ]},
      { heading: "Submit the report", paragraphs: [
        "Use the public GitHub issue tracker. Please search existing issues first to avoid duplicate reports."
      ], links: [
        { label: "Report an EARTH WEATHER issue", href: "https://github.com/MohammedRiyashB/earthweatherchannel/issues" }
      ]}
    ]
  },
  "submit-feedback": {
    eyebrow: "SUPPORT · SUBMIT FEEDBACK",
    title: "Help improve EARTH WEATHER.",
    lead: "Product feedback is most useful when it explains the problem it solves and how it affects your weather experience.",
    sections: [
      { heading: "Useful feedback topics", bullets: [
        "Which weather information should be easier to find?",
        "Which page or card is hard to read or use on a mobile device?",
        "Does the website feel slow, confusing or difficult to navigate?",
        "Which language, accessibility or local-weather improvement would help?",
        "What would make the data source and timestamp clearer?"
      ]},
      { heading: "Send feedback", paragraphs: [
        "Feedback is currently collected through the public project issue tracker. Do not include sensitive personal information. There is no separate feedback form or private feedback mailbox published yet."
      ], links: [
        { label: "Submit product feedback", href: "https://github.com/MohammedRiyashB/earthweatherchannel/issues" }
      ]}
    ]
  },
  "report-weather-data": {
    eyebrow: "SUPPORT · REPORT WEATHER DATA",
    title: "Report a weather-data concern.",
    lead: "Weather values can differ between providers and local observations. A precise report helps distinguish a display defect from a genuine difference between models or observation times.",
    sections: [
      { heading: "What to include", bullets: [
        "Place name and, only if necessary, approximate coordinates.",
        "The field in question: temperature, humidity, wind, cloud cover, precipitation or condition label.",
        "The value and unit shown by EARTH WEATHER.",
        "The displayed observation/retrieval time and your local time zone.",
        "A comparison link from IMD, NDMA, a local official weather authority or another clearly identified source.",
        "A screenshot with private details removed."
      ]},
      { heading: "How we assess reports", paragraphs: [
        "We compare the provider, timestamp, reference coordinates, units and data type. A numerical-model estimate may differ from a nearby ground station or another weather app without either display being a software bug.",
        "Do not treat a public issue as an emergency alert. Report immediate hazards to the official authority."
      ]},
      { heading: "Submit a data report", links: [
        { label: "Open the issue tracker", href: "https://github.com/MohammedRiyashB/earthweatherchannel/issues" },
        { label: "IMD official forecasts and warnings", href: "https://mausam.imd.gov.in/index_en.php" }
      ]}
    ]
  },
  accessibility: {
    eyebrow: "SUPPORT · ACCESSIBILITY",
    title: "Accessibility at EARTH WEATHER.",
    lead: "Weather information should be understandable and usable across different devices, abilities and browsing preferences.",
    sections: [
      { heading: "Current experience", bullets: [
        "Responsive layouts for mobile and desktop screens.",
        "Text labels alongside weather icons and measurements.",
        "Form labels and accessible names on key search and location controls.",
        "A reduced-motion preference in the weather-scene animation styles.",
        "Keyboard-operable links and buttons for the main navigation and page controls."
      ]},
      { heading: "Known limitations", paragraphs: [
        "The website has not been independently audited or certified against WCAG. Some complex weather visualisations, third-party imagery, colour-based status displays or embedded provider content may not yet offer an equivalent accessible representation."
      ]},
      { heading: "How to request an improvement", paragraphs: [
        "Tell us the page, device, assistive technology or browser setting you use, and the barrier you encountered. Please do not share private health information."
      ], links: [
        { label: "Report an accessibility issue", href: "https://github.com/MohammedRiyashB/earthweatherchannel/issues" }
      ]}
    ]
  },
  "account-security": {
    eyebrow: "SUPPORT · ACCOUNT & SECURITY",
    title: "Account and sign-in security.",
    lead: "Google sign-in is optional. The public weather experience does not require an account or a separate EARTH WEATHER password.",
    sections: [
      { heading: "How sign-in works", paragraphs: [
        "The current website uses Google sign-in through Firebase Authentication. EARTH WEATHER does not ask you to create a separate site password in the current implementation. Your Google account credentials are entered through Google's authentication flow."
      ], links: [
        { label: "Firebase privacy and security", href: "https://firebase.google.com/support/privacy" },
        { label: "Google Account Security", href: "https://myaccount.google.com/security" }
      ]},
      { heading: "Protect your account", bullets: [
        "Use a strong Google account password and enable Google's available two-step verification or passkey protections.",
        "Never share one-time codes or sign-in approval prompts.",
        "Sign out on shared devices and keep your operating system and browser updated.",
        "Check your Google account's signed-in devices and recent security activity."
      ]},
      { heading: "Browser permissions are separate", paragraphs: [
        "Location and notification permissions are controlled by the browser/device. They are separate from Google sign-in. You can deny or revoke them without creating an account."
      ]},
      { heading: "Report a security concern", paragraphs: [
        "Do not publish a working exploit, credential, private token or personal data in a public issue. The project has not published a dedicated private security disclosure address. Avoid sharing the sensitive details publicly while requesting a private contact route through the repository."
      ], links: [
        { label: "Project repository", href: "https://github.com/MohammedRiyashB/earthweatherchannel" }
      ]}
    ]
  }
};

export function SitePageView({ slug }: { slug: SitePageId }) {
  const page = PAGES[slug];
  React.useEffect(() => {
    const previousTitle = document.title;
    const title = `${page.title.replace(/[.]+$/, "")} | EARTH WEATHER`;
    document.title = title;
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.name = "description";
      document.head.appendChild(description);
    }
    const previousDescription = description.content;
    description.content = page.lead.slice(0, 155);
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    const previousCanonical = canonical.href;
    canonical.href = `https://earthweatherchannel.web.app${SITE_PATHS[slug]}`;
    return () => {
      document.title = previousTitle;
      description!.content = previousDescription;
      canonical!.href = previousCanonical;
    };
  }, [slug, page.title, page.lead]);
  return (
    <div className="site-content-page">
      <div className="info-page-brand"><img src="/logo.png" alt="EARTH WEATHER" /></div>
      <article className="info-card site-page-card">
        <span className="eyebrow">{page.eyebrow}</span>
        <h1>{page.title}</h1>
        <p className="info-lead">{page.lead}</p>
        <div className="site-page-updated">EARTH WEATHER CHANNEL · BMR INC.</div>
        {page.sections.map((section, index) => (
          <section className="site-page-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph, pIndex) => <p key={pIndex}>{paragraph}</p>)}
            {section.bullets?.length ? (
              <ul className="site-page-list">
                {section.bullets.map((bullet, bIndex) => <li key={bIndex}>{bullet}</li>)}
              </ul>
            ) : null}
            {section.note ? <div className="site-page-note">{section.note}</div> : null}
            {section.links?.length ? (
              <div className="site-page-sources">
                {section.links.map(link => (
                  <a key={link.href} href={link.href} target={link.href.startsWith("/") ? undefined : "_blank"} rel={link.href.startsWith("/") ? undefined : "noreferrer"}>
                    <strong>{link.label}</strong>
                    {link.description ? <span>{link.description}</span> : null}
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </article>
      <div className="site-page-bottom">
        <a className="back-home" href="/">← Back to Weather</a>
        <a className="site-page-top-link" href="/weather-data-sources">Explore data transparency</a>
      </div>
    </div>
  );
}
