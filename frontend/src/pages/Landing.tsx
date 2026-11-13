import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Health } from "../types";
import { BackToTop } from "../components/landing/BackToTop";
import { LandingComparison } from "../components/landing/LandingComparison";
import { LandingCTA } from "../components/landing/LandingCTA";
import { LandingDemo } from "../components/landing/LandingDemo";
import { LandingFeatures } from "../components/landing/LandingFeatures";
import { LandingFooter } from "../components/landing/LandingFooter";
import { LandingHero } from "../components/landing/LandingHero";
import { LandingHowItWorks } from "../components/landing/LandingHowItWorks";
import { LandingNav } from "../components/landing/LandingNav";
import { LandingStats } from "../components/landing/LandingStats";
import { ScrollProgress } from "../components/landing/ScrollProgress";

export default function Landing() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  // Poll backend health on mount and every 20s while the document is visible
  useEffect(() => {
    let alive = true;

    const check = () => {
      if (document.visibilityState !== "visible") return;
      api
        .health()
        .then((h) => {
          if (alive) {
            setHealth(h);
            setDown(false);
          }
        })
        .catch(() => {
          if (alive) {
            setDown(true);
          }
        });
    };

    check();
    const intervalId = window.setInterval(check, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        check();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div className="relative min-h-screen text-ink selection:bg-indigo/20 selection:text-indigo">
      {/* Accessibility Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-indigo focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Atmospheric Aurora Backdrop */}
      <div className="aurora" aria-hidden="true" />

      {/* Scroll Progress Indicator */}
      <ScrollProgress />

      {/* Top Glass Navigation */}
      <LandingNav health={health} down={down} />

      {/* Main Content Sections */}
      <main id="main-content" className="relative z-10 flex flex-col">
        <LandingHero down={down} />
        <LandingStats />
        <LandingHowItWorks />
        <LandingDemo />
        <LandingFeatures />
        <LandingComparison />
        <LandingCTA />
      </main>

      {/* Footer */}
      <LandingFooter />

      {/* Back to Top Button */}
      <BackToTop />
    </div>
  );
}
