import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

const countries = new Set<string>(getCountries());

export function countryOptions(language: "da" | "en") {
  const names = new Intl.DisplayNames([language], { type: "region" });
  return getCountries().map(code => ({ code, label: `${names.of(code) || code} (+${getCountryCallingCode(code)})` }))
    .sort((a, b) => a.label.localeCompare(b.label, language));
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
