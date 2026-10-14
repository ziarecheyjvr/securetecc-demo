"use client";

import { useEffect } from "react";

/**
 * Browser half of reCAPTCHA v3.
 *
 * The script is loaded lazily and only when a site key exists, so a
 * deployment with no key configured pulls nothing from Google at all -- no
 * third-party request, no badge, no console noise.
 */
const SCRIPT_ID = "recaptcha-v3";

type Grecaptcha = {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, options: { action: string }) => Promise<string>;
};

function grecaptcha(): Grecaptcha | null {
  return (window as unknown as { grecaptcha?: Grecaptcha }).grecaptcha ?? null;
}

export function useRecaptchaScript(siteKey: string | null): void {
  useEffect(() => {
    if (!siteKey || typeof document === "undefined") return;
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    document.head.appendChild(script);
  }, [siteKey]);
}

/**
 * A token for one action, or null.
 *
 * Null on any failure -- blocked script, offline, a browser extension eating
 * it -- rather than throwing. The server decides what an absent token means;
 * a person with a broken network should not be blocked from reporting that
 * their network is broken by the anti-bot check itself.
 */
export async function executeRecaptcha(
  siteKey: string,
  action: string,
): Promise<string | null> {
  const api = grecaptcha();
  if (!api) return null;
  try {
    return await new Promise<string>((resolve, reject) => {
      api.ready(() => {
        api.execute(siteKey, { action }).then(resolve).catch(reject);
      });
    });
  } catch {
    return null;
  }
}
