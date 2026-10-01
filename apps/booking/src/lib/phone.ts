import { getCountries, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

import labels from "./phone-countries.json";

const countries = new Set<string>(getCountries());

export function countryOptions(language: "da" | "en") {
  // Versioned names/order keep server and browser ICU differences from
  // causing hydration failures and discarding entered customer details.
  return labels[language];
}

export function normalizePhone(value: string, selectedCountry: string): string | null {
  if (!countries.has(selectedCountry) || value.length > 30 || !/^\s*\+?[0-9 ()-]+\s*$/.test(value)) return null;
  const compact = value.replace(/[ ()-]/g, "").trim();
  if (!/^\+?\d+$/.test(compact)) return null;
  // An explicit international prefix wins over the selector. National input uses the selector.
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  const parsed = parsePhoneNumberFromString(international, selectedCountry as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}
