export function ManageLanguageSwitch({ language, preview = false }: { language: "da" | "en"; preview?: boolean }) {
  const path = preview ? "/manage/preview" : "/manage";
  return <nav className="manage-language-switch" aria-label={language === "da" ? "Sprog" : "Language"}>
    <a href={`${path}?lang=da`} lang="da" aria-current={language === "da" ? "page" : undefined}>DA</a>
    <span aria-hidden="true">/</span>
    <a href={`${path}?lang=en`} lang="en" aria-current={language === "en" ? "page" : undefined}>EN</a>
  </nav>;
}
