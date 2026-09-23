/** Publication rights and creator credits for supplied images are tracked in EDITORIAL_MEDIA_LEDGER.md. */
export const media = {
  heroPortrait: "/work/dd_hero.webp",
  lowerBanner: "/work/dd_halo_banner.webp",
  holditPortrait: "https://a.storyblok.com/f/240181/1080x1533/92e6217226/hro_pr_m03_didde_mie_1080x1533.jpg/m/1080x0/filters:quality(80)",
  umbroPortrait: "/work/umbro_goya.webp",
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
    number: "04", category: "MODELLING / CAMPAIGNS", title: "STINE GOYA × Umbro", role: "Campaign appearance · 2026",
    note: "The Where We Meet campaign places DD’s movement inside a local pub setting.",
    image: media.umbroPortrait, imageAlt: "DD seated in a checked STINE GOYA × Umbro shirt with her feet on a pub table",
    imagePosition: "center 38%", imageCredit: "User-supplied STINE GOYA × Umbro campaign photograph / photographer to confirm",
    sourceUrl: "https://www.umbro.com/en/style/collections/stine-goya-x-umbro-where-we-meet/", sourceLabel: "View campaign",
  },
  {
    number: "05", category: "MODELLING / CAMPAIGNS", title: "Holdit / Puffy Case", role: "Campaign front face",
    note: "Holdit presents DD through movement-led images for its Puffy Case launch.",
    image: media.holditPortrait, imageAlt: "DD posing in the Holdit Puffy Case campaign with a phone in her hand",
    imagePosition: "center 40%", imageCredit: "Holdit / Puffy Case campaign",
    sourceUrl: "https://holdit.com/en/press/holdit-steps-into-the-spotlight-with-didde-mie", sourceLabel: "View Holdit campaign",
  },
] as const;

export const films = [
  { number: "01", title: "Houdini / Glastonbury", detail: "Dua Lipa · DD: dancer · BBC Music · flashing lights", kind: "TOUR RECORDING", publisher: "BBC Music", image: media.glastonbury, imageAlt: "DD at far left among dancers performing with Dua Lipa at Glastonbury", youtubeId: "qeQfFfRy_FU", url: "https://www.youtube.com/watch?v=qeQfFfRy_FU" },
  { number: "02", title: "Jungle / Back On 74", detail: "Jungle · DD: dancer · choreography: Shay Latukolan", kind: "MUSIC VIDEO", publisher: "Jungle", image: media.jungle, imageAlt: "Three dancers in a scene from Jungle’s Back On 74", youtubeId: "q3lX2p_Uy9I", url: "https://www.youtube.com/watch?v=q3lX2p_Uy9I" },
  { number: "03", title: "Berghain / LUX Tour", detail: "Rosalía · LUX Tour performance · PITA Music audience recording", kind: "TOUR RECORDING", publisher: "PITA Music", image: media.rosaliaLux, imageAlt: "Rosalía and LUX Tour dancers onstage", youtubeId: "spc9rrcX-wo", url: "https://www.youtube.com/watch?v=spc9rrcX-wo" },
] as const;
