/** Publication rights and creator credits for supplied images are tracked in EDITORIAL_MEDIA_LEDGER.md. */
export const media = {
  heroPortrait: "/work/dd_hero.webp",
  lowerBanner: "/work/dd_halo_banner.webp",
  glastonbury: "/work/dua_glastonbury.jpg",
  jungle: "/work/jungle_74.webp",
  rosaliaLux: "/work/rosalia_lux.jpg",
} as const;

export const work = [
  {
    number: "01", category: "DANCE", title: "Dua Lipa / Glastonbury", role: "Dancer · 2024",
    note: "DD performed in Dua Lipa’s Pyramid Stage set. She is the dancer at far left in this photograph.",
    image: media.glastonbury, imageAlt: "DD at far left among dancers performing with Dua Lipa at Glastonbury",
    imagePosition: "left center", imageCredit: "User-supplied Glastonbury photograph / photographer to confirm",
    sourceUrl: "https://www.voguescandinavia.com/articles/what-people-are-wearing-in-scandinavia-cphfw-ss26", sourceLabel: "Vogue credit",
    filmUrl: "#films", filmLabel: "Play in Selected Films",
  },
  {
    number: "02", category: "DANCE", title: "Jungle / Back On 74", role: "Dancer · 2023",
    note: "DD is credited as a dancer in Back On 74. Choreography is by Shay Latukolan.",
    image: media.jungle, imageAlt: "Three dancers in a desert-set scene from Jungle’s Back On 74",
    imagePosition: "center", imageCredit: "User-supplied Back On 74 still / creator to confirm",
    sourceUrl: "https://vimeo.com/850231443", sourceLabel: "Full production credits",
    filmUrl: "#films", filmLabel: "Play in Selected Films",
  },
  {
    number: "03", category: "DANCE / LIVE", title: "Rosalía / LUX Tour", role: "Tour dancer · 2026",
    note: "DD joined Rosalía’s LUX world tour as a dancer.",
    image: media.rosaliaLux, imageAlt: "Rosalía performing with dancers on the LUX Tour stage",
    imagePosition: "center", imageCredit: "User-supplied LUX Tour photograph / photographer to confirm",
    sourceUrl: "https://www.voguescandinavia.com/articles/didde-mie-beauty-guide", sourceLabel: "DD’s tour interview",
    filmUrl: "#films", filmLabel: "Play in Selected Films",
  },
  {
    number: "04", category: "CAMPAIGN VIDEO", title: "GAP x Jungle - Linen Moves Campaign (feat. Tyla)", role: "Dancer",
    note: "Campaign Video · DD: dancer",
    image: "/work/work-gap.webp", imageAlt: "Dancers performing in the GAP x Jungle Linen Moves campaign",
    imagePosition: "center", imageCredit: "User-supplied project image",
    sourceUrl: "https://www.youtube.com/watch?v=8unVMB-LoT8", sourceLabel: "Watch original video",
    filmUrl: "#films", filmLabel: "Play in Selected Films",
  },
  {
    number: "05", category: "CAMPAIGN VIDEO", title: "LISA x NikeSKIMS Spring ’26 Collection | Nike", role: "Dancer",
    note: "Campaign Video · DD: dancer",
    image: "/work/work-lisa.webp", imageAlt: "LISA and dancers in the NikeSKIMS Spring ’26 campaign",
    imagePosition: "center", imageCredit: "User-supplied project image",
    sourceUrl: "https://www.youtube.com/watch?v=65B_GoV-qoE", sourceLabel: "Watch original video",
    filmUrl: "#films", filmLabel: "Play in Selected Films",
  },
  {
    number: "06", category: "MUSIC VIDEO", title: "Calvin Harris - Potion (Official Video) ft Dua Lipa & Young Thug", role: "Dancer",
    note: "Music Video · DD: dancer",
    image: "/work/work-potion.webp", imageAlt: "Dancers performing in Calvin Harris’s Potion music video",
    imagePosition: "center", imageCredit: "User-supplied project image",
    sourceUrl: "https://www.youtube.com/watch?v=FFV6t4Dl_zQ", sourceLabel: "Watch original video",
    filmUrl: "#films", filmLabel: "Play in Selected Films",
  },
  {
    number: "07", category: "MUSIC VIDEO", title: "DJ Snake, Don Toliver - Something Wrong (Visualizer)", role: "Dancer",
    note: "Music Video · DD: dancer",
    image: "/work/work-snake.webp", imageAlt: "A dancer seated at a red table in DJ Snake and Don Toliver’s Something Wrong visualizer",
    imagePosition: "center", imageCredit: "User-supplied project image",
    sourceUrl: "https://www.youtube.com/watch?v=U9rd8gUe5HA", sourceLabel: "Watch original video",
    filmUrl: "#films", filmLabel: "Play in Selected Films",
  },
] as const;

export const films = [
  { number: "01", title: "Houdini / Glastonbury", detail: "Dua Lipa · DD: dancer · BBC Music · flashing lights", kind: "TOUR RECORDING", publisher: "BBC Music", image: media.glastonbury, imageAlt: "DD at far left among dancers performing with Dua Lipa at Glastonbury", youtubeId: "qeQfFfRy_FU", url: "https://www.youtube.com/watch?v=qeQfFfRy_FU" },
  { number: "02", title: "Jungle / Back On 74", detail: "Jungle · DD: dancer · choreography: Shay Latukolan", kind: "MUSIC VIDEO", publisher: "Jungle", image: media.jungle, imageAlt: "Three dancers in a scene from Jungle’s Back On 74", youtubeId: "q3lX2p_Uy9I", url: "https://www.youtube.com/watch?v=q3lX2p_Uy9I" },
  { number: "03", title: "Berghain / LUX Tour", detail: "Rosalía · LUX Tour performance · PITA Music audience recording", kind: "TOUR RECORDING", publisher: "PITA Music", image: media.rosaliaLux, imageAlt: "Rosalía and LUX Tour dancers onstage", youtubeId: "spc9rrcX-wo", url: "https://www.youtube.com/watch?v=spc9rrcX-wo" },
  { number: "04", title: "Calvin Harris - Potion (Official Video) ft Dua Lipa & Young Thug", detail: "Calvin Harris · Dua Lipa & Young Thug · DD: dancer", kind: "MUSIC VIDEO", publisher: "Calvin Harris", image: "/work/film-potion.webp", imageAlt: "Dancers in Calvin Harris’s Potion music video", youtubeId: "FFV6t4Dl_zQ", url: "https://www.youtube.com/watch?v=FFV6t4Dl_zQ" },
  { number: "05", title: "DJ Snake, Don Toliver - Something Wrong (Visualizer)", detail: "DJ Snake · Don Toliver · DD: dancer", kind: "MUSIC VIDEO", publisher: "DJ Snake", image: "/work/film-snake.webp", imageAlt: "A dancer silhouetted in DJ Snake and Don Toliver’s Something Wrong visualizer", youtubeId: "U9rd8gUe5HA", url: "https://www.youtube.com/watch?v=U9rd8gUe5HA" },
  { number: "06", title: "GAP x Jungle - Linen Moves Campaign (feat. Tyla)", detail: "GAP x Jungle · Tyla · DD: dancer", kind: "CAMPAIGN VIDEO", publisher: "Jungle", image: "/work/film-gap.webp", imageAlt: "Dancers on the GAP x Jungle Linen Moves campaign set", youtubeId: "8unVMB-LoT8", url: "https://www.youtube.com/watch?v=8unVMB-LoT8" },
  { number: "07", title: "LISA x NikeSKIMS Spring ’26 Collection | Nike", detail: "NikeSKIMS · LISA · DD: dancer", kind: "CAMPAIGN VIDEO", publisher: "Nike", image: "/work/film-lisa.webp", imageAlt: "LISA and dancers in the NikeSKIMS Spring ’26 campaign", youtubeId: "65B_GoV-qoE", url: "https://www.youtube.com/watch?v=65B_GoV-qoE" },
  { number: "08", title: "ROSALÍA - Berghain (Live at The BRIT Awards 2026) ft. Björk", detail: "Rosalía · Björk · BRIT Awards 2026", kind: "LIVE PERFORMANCE", publisher: "ROSALÍA", image: "/work/film-brits.webp", imageAlt: "Rosalía and dancers performing Berghain at the BRIT Awards 2026", youtubeId: "7fyufPkXLbs", url: "https://www.youtube.com/watch?v=7fyufPkXLbs" },
  { number: "09", title: "ROSALÍA - DE AQUÍ NO SALES", detail: "Rosalía · DE AQUÍ NO SALES (Cap.4: Disputa)", kind: "MUSIC VIDEO", publisher: "ROSALÍA", image: "/work/film-deaqui.webp", imageAlt: "Rosalía in the DE AQUÍ NO SALES music video", youtubeId: "vy4lZs8fVRQ", url: "https://www.youtube.com/watch?v=vy4lZs8fVRQ" },
] as const;

// Ordered clip selections. A future Sanity query can supply this same data shape.
export const clips = [
  {
    "id": "jungle",
    "src": "/clips/jungle.mp4",
    "poster": "/clips/jungle.webp",
    "title": "Jungle / Back On 74",
    "alt": "Dance excerpt from Jungle / Back On 74"
  },
  {
    "id": "potion",
    "src": "/clips/potion.mp4",
    "poster": "/clips/potion.webp",
    "title": "Calvin Harris / Potion",
    "alt": "Dance excerpt from Calvin Harris / Potion"
  },
  {
    "id": "gap",
    "src": "/clips/gap.mp4",
    "poster": "/clips/gap.webp",
    "title": "GAP x Jungle / Linen Moves",
    "alt": "Dance excerpt from GAP x Jungle / Linen Moves"
  },
  {
    "id": "lisa",
    "src": "/clips/lisa.mp4",
    "poster": "/clips/lisa.webp",
    "title": "LISA x NikeSKIMS",
    "alt": "Dance excerpt from LISA x NikeSKIMS"
  },
  {
    "id": "something-wrong",
    "src": "/clips/something-wrong.mp4",
    "poster": "/clips/something-wrong.webp",
    "title": "DJ Snake, Don Toliver / Something Wrong",
    "alt": "Dance excerpt from DJ Snake, Don Toliver / Something Wrong"
  },
  {
    "id": "houdini",
    "src": "/clips/houdini.mp4",
    "poster": "/clips/houdini.webp",
    "title": "Dua Lipa / Glastonbury",
    "alt": "Dance excerpt from Dua Lipa / Glastonbury"
  },
  {
    "id": "berghain",
    "src": "/clips/berghain.mp4",
    "poster": "/clips/berghain.webp",
    "title": "Rosalía / BRIT Awards 2026",
    "alt": "Dance excerpt from Rosalía / BRIT Awards 2026"
  },
  {
    "id": "de-aqui-no-sales",
    "src": "/clips/de-aqui-no-sales.mp4",
    "poster": "/clips/de-aqui-no-sales.webp",
    "title": "Rosalía / DE AQUÍ NO SALES",
    "alt": "Dance excerpt from Rosalía / DE AQUÍ NO SALES"
  }
] as const;
