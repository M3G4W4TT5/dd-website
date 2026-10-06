export const copyFields = {
  navigation: ["introduction", "flowerDesktop", "flowerMobile", "mainLabel", "mobileLabel", "work", "contact", "booking", "mobileBooking", "menu", "wordmarkLabel"],
  footer: ["owner", "privacy", "credit", "creditLabel"],
  forms: ["previewBefore", "previewAfter", "honeypot"],
  contact: ["nameLabel", "namePlaceholder", "emailLabel", "emailPlaceholder", "subjectLabel", "subjectPlaceholder", "dance", "choreography", "modelling", "brand_partnerships", "other", "messageLabel", "messagePlaceholder", "validation", "send", "sending", "success", "error", "privacyBefore", "privacyLink", "privacyAfter"],
  newsletter: ["intro", "emailLabel", "emailPlaceholder", "sending", "send", "notice", "privacy", "unsubscribe", "success", "error"],
  reel: ["canvasLabel", "label", "fallbackLabel", "sourceLabel", "explore", "previous", "next", "play", "pause"],
  work: ["imageError", "loading", "watch", "region", "galleryHint", "previous", "next", "listHint", "scrollPrevious", "scrollNext"],
  unsubscribe: ["emailLabel", "sending", "send", "success", "error"],
  marketing: ["working", "expired", "error", "back"],
} as const;
export type CopyGroup<K extends keyof typeof copyFields> = Record<(typeof copyFields)[K][number], string>;
