import { useFormsAvailable, formEndpoint, PreviewFormsNotice } from "../lib/forms";
import { useEffect, useState } from "react";

export function MarketingAction({
  list,
  purpose,
  token: initialToken,
  language,
}: {
  list: "personal" | "booking";
  purpose: "confirm" | "unsubscribe";
  token: string;
  language: "da" | "en";
}) {
  const available = useFormsAvailable();
  const [token, setToken] = useState(initialToken);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (value) setToken(value);
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);
  const [state, setState] = useState<
    "ready" | "working" | "done" | "expired" | "error"
  >("ready");
  const isPersonal = list === "personal";
  const da = language === "da" && !isPersonal;
  const title =
    purpose === "confirm"
      ? da
        ? "Bekræft din tilmelding"
        : "Confirm your email signup"
      : da
        ? "Afmeld e-mails"
        : "Unsubscribe from emails";
  async function submit() {
    if (!available) return;
    setState("working");
    try {
      const response = await fetch(
        formEndpoint("/api/marketing/action"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ list, purpose, token }),
        },
      );
      setState(
        response.ok ? "done" : response.status === 410 ? "expired" : "error",
      );
    } catch {
      setState("error");
    }
  }
  return (
    <main className={isPersonal ? "newsletter-unsubscribe-page marketing-page" : "marketing-page"}>
      {isPersonal ? <a href="/" className="wordmark">DD<span>.</span></a> : <span>TTD STUDIO</span>}
      <h1>{isPersonal ? purpose === "confirm" ? "CONFIRM SIGNUP." : "UNSUBSCRIBE." : title}</h1>
      <PreviewFormsNotice available={available} />
      <p>
        {purpose === "confirm"
          ? da
            ? "Bekræft, at du vil modtage e-mails om TTD Studio-tilbud, nye events og rabatter."
            : `Confirm that you want ${isPersonal ? "my newsletter about my work and dance videos" : "TTD Studio emails about offers, new events and discounts"}.`
          : da
            ? "Stop e-mails om TTD Studio-tilbud, nye events og rabatter til denne adresse."
            : `Stop ${isPersonal ? "my newsletter" : "TTD Studio promotional"} emails to this address.`}
      </p>
      {(state === "ready" || state === "error") && /^[A-Za-z0-9_-]{43}$/.test(token) && (
        <button type="button" disabled={!available} onClick={() => void submit()}>
          {purpose === "confirm"
            ? da
              ? "Bekræft tilmelding"
              : "Confirm signup"
            : da
              ? "Afmeld"
              : "Unsubscribe"}
        </button>
      )}
      {state === "ready" && !/^[A-Za-z0-9_-]{43}$/.test(token) && (
        <p role="status">
          Open the {purpose === "confirm" ? "confirmation" : "unsubscribe"} link
          from your email. If you have just signed in, reopen that link to continue.
        </p>
      )}
      {state === "ready" && !/^[A-Za-z0-9_-]{43}$/.test(token) && (
        <p role="alert">{da ? "Linket er ugyldigt eller mangler." : "This link is missing or invalid. Please use the full link from your email."}</p>
      )}
      {state === "working" && (
        <p role="status">{da ? "Arbejder…" : "Working…"}</p>
      )}
      {state === "done" && (
        <p role="status">
          {purpose === "confirm"
            ? da
              ? "Din tilmelding er bekræftet."
              : "Your signup is confirmed."
            : da
              ? "Du er nu afmeldt."
              : "You have been unsubscribed."}
        </p>
      )}
      {state === "expired" && (
        <p role="status">
          {da
            ? "Linket er udløbet eller er allerede brugt."
            : "This link has expired or has already been used."}
        </p>
      )}
      {state === "error" && (
        <p role="alert">
          {da
            ? "Vi kunne ikke gennemføre anmodningen. Prøv igen senere."
            : "We could not complete this request. Please try again later."}
        </p>
      )}
      {isPersonal && (state === "expired" || (state === "ready" && !/^[A-Za-z0-9_-]{43}$/.test(token))) && (
        <p><a href={purpose === "unsubscribe" ? "/unsubscribe" : "/#contact"}>{purpose === "unsubscribe" ? "Request a new unsubscribe link" : "Sign up again for a new confirmation link"}</a></p>
      )}
      <a href={isPersonal ? "https://didde-mie.com" : "/"}>
        {da
          ? "Tilbage til TTD Studio"
          : `Back to ${isPersonal ? "DD" : "TTD Studio"}`}
      </a>
    </main>
  );
}
