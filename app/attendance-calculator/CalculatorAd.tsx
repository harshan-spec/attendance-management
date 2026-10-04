"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const publisher = "ca-pub-2851684575995607";

export function CalculatorAd() {
  const adRef = useRef<HTMLModElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setEnabled(window.location.hostname === "attendance-management-beta-flax.vercel.app");
  }, []);

  useEffect(() => {
    const ad = adRef.current;
    if (!enabled || !ad) return;
    const observer = new MutationObserver(() => {
      if (ad.getAttribute("data-ad-status") === "unfilled") setUnavailable(true);
    });
    observer.observe(ad, { attributes: true, attributeFilter: ["data-ad-status"] });
    return () => observer.disconnect();
  }, [enabled]);

  function requestAd() {
    const ad = adRef.current;
    if (!ad || ad.hasAttribute("data-adsbygoogle-status") || ad.dataset.requested) return;
    if (ad.getBoundingClientRect().width === 0) return;
    ad.dataset.requested = "true";
    try {
      const adWindow = window as Window & { adsbygoogle?: Record<string, never>[] };
      (adWindow.adsbygoogle ??= []).push({});
    } catch {
      setUnavailable(true);
    }
  }

  if (!enabled) return null;
  return <>
    <Script id="attendly-adsense" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisher}`} strategy="afterInteractive" crossOrigin="anonymous" onReady={requestAd} onError={() => setUnavailable(true)} />
    <aside className="calculator-ad" aria-label="Advertisement" hidden={unavailable}>
      <span className="calculator-ad-label">Advertisement</span>
      <ins ref={adRef} className="adsbygoogle" style={{ display: "block" }} data-ad-client={publisher} data-ad-slot="3113067230" data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  </>;
}
