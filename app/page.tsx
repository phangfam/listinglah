"use client";

import { useState, useEffect, useCallback } from "react";
import type { GeneratedCopy, CopyVariants } from "./api/generate/route";
import { FREE_LIMIT } from "@/lib/constants";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROPERTY_TYPES = [
  "Condominium / Apartment",
  "Terrace House",
  "Semi-Detached House",
  "Bungalow",
  "Studio",
  "Serviced Apartment",
  "SOHO",
  "Shop Office",
  "Retail Space",
  "Industrial / Warehouse",
  "Land",
];

type Language = "en" | "bm" | "zh";
type Variant = "facebook_caption" | "whatsapp_pitch" | "propertyguru_description";

const LANG_LABELS: Record<Language, string> = {
  en: "English",
  bm: "BM",
  zh: "中文",
};

const VARIANT_META: Record<
  Variant,
  { label: string; icon: string; desc: string; stripe: string }
> = {
  facebook_caption: {
    label: "Facebook",
    icon: "📘",
    desc: "For Facebook property groups",
    stripe: "bg-blue-400",
  },
  whatsapp_pitch: {
    label: "WhatsApp",
    icon: "💬",
    desc: "Paste directly into WhatsApp",
    stripe: "bg-emerald-400",
  },
  propertyguru_description: {
    label: "PropertyGuru",
    icon: "🏠",
    desc: "Professional portal listing",
    stripe: "bg-orange-400",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("ll_session_id");
  if (!id) {
    id = generateSessionId();
    localStorage.setItem("ll_session_id", id);
  }
  return id;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsagePill({
  count,
  isPaid,
  onUpgrade,
}: {
  count: number;
  isPaid: boolean;
  onUpgrade: () => void;
}) {
  if (isPaid) {
    return (
      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-full font-semibold tracking-wide">
        ✦ Pro
      </span>
    );
  }
  const remaining = Math.max(0, FREE_LIMIT - count);
  const pillColor =
    remaining === 0
      ? "text-red-600 border-red-200 bg-red-50"
      : remaining === 1
      ? "text-amber-600 border-amber-200 bg-amber-50"
      : "text-gray-500 border-gray-200 bg-white";
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs px-3 py-1.5 rounded-full border font-medium ${pillColor}`}>
        {remaining} free {remaining === 1 ? "generation" : "generations"} left
      </span>
      {remaining === 0 && (
        <button
          onClick={onUpgrade}
          className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-full font-semibold transition-colors"
        >
          Upgrade ↗
        </button>
      )}
    </div>
  );
}

function CopyCard({ variant, text }: { variant: Variant; text: string }) {
  const [copied, setCopied] = useState(false);
  const meta = VARIANT_META[variant];

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${meta.stripe}`} />
      <div className="pl-5 pr-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {meta.icon}&nbsp; {meta.label}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
          </div>
          <button
            onClick={handleCopy}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
              copied
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent"
            }`}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function UpgradeModal({ onClose, sessionId }: { onClose: () => void; sessionId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY;

  async function handleUpgrade() {
    if (!priceId) {
      setError("Stripe is not configured yet — check back soon!");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-lg font-bold">✦</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">You&apos;re out of free generations!</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            You&apos;ve used your {FREE_LIMIT} free generations. Upgrade to Pro for unlimited listings at RM29/month.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
          {[
            "Unlimited AI listing copy generation",
            "Facebook, WhatsApp & PropertyGuru formats",
            "English, Bahasa Malaysia & Simplified Chinese",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2.5 text-sm text-gray-700">
              <span className="w-4 h-4 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                ✓
              </span>
              {item}
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl transition-colors text-sm tracking-wide shadow-lg shadow-emerald-200"
        >
          {loading ? "Redirecting…" : "Subscribe — RM29 / month"}
        </button>

        <button
          onClick={onClose}
          className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-white placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-shadow";

const labelClass =
  "block text-[11px] font-semibold tracking-widest uppercase text-gray-400 mb-2";

export default function Home() {
  const [sessionId, setSessionId] = useState("");
  const [usageCount, setUsageCount] = useState(0);
  const [isPaid, setIsPaid] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [form, setForm] = useState({
    propertyType: "",
    location: "",
    propertyDetails: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedCopy | null>(null);
  const [activeLang, setActiveLang] = useState<Language>("en");

  const fetchUsage = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/usage?sessionId=${sid}`);
      const data = await res.json();
      setUsageCount(data.count ?? 0);
      setIsPaid(data.isPaid ?? false);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    const sid = getSessionId();
    setSessionId(sid);
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setIsPaid(true);
      window.history.replaceState({}, "", "/");
    }
    fetchUsage(sid);
  }, [fetchUsage]);

  // Close the mobile menu on Escape for keyboard accessibility.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isPaid && usageCount >= FREE_LIMIT) {
      setShowUpgrade(true);
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const payload = {
        sessionId,
        propertyType: form.propertyType,
        location: form.location,
        propertyDetails: form.propertyDetails || undefined,
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.status === 402 || data.limitReached) {
        setShowUpgrade(true);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Failed to generate listing copy");

      setResult(data.generated);
      setUsageCount((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const langVariants: CopyVariants | null = result ? result[activeLang] : null;

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      {showUpgrade && sessionId && (
        <UpgradeModal sessionId={sessionId} onClose={() => setShowUpgrade(false)} />
      )}

      {/* ── Header ── */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-sm shadow-emerald-200">
              <span className="text-white text-sm font-bold leading-none">✦</span>
            </div>
            <span className="text-base font-bold text-gray-900 tracking-tight">ListingLah</span>
          </div>

          {/* Desktop (md+): usage pill inline */}
          {sessionId && (
            <div className="hidden md:block">
              <UsagePill count={usageCount} isPaid={isPaid} onUpgrade={() => setShowUpgrade(true)} />
            </div>
          )}

          {/* Mobile (below md): hamburger trigger */}
          {sessionId && (
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 -mr-2 rounded-lg text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-colors"
            >
              <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          )}
        </div>

        {/* Mobile (below md): collapsible menu panel */}
        {sessionId && menuOpen && (
          <div id="mobile-menu" className="md:hidden border-t border-gray-100 px-6 py-4 flex justify-end">
            <UsagePill
              count={usageCount}
              isPaid={isPaid}
              onUpgrade={() => {
                setMenuOpen(false);
                setShowUpgrade(true);
              }}
            />
          </div>
        )}
      </header>

      {/* ── Main ── */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 items-start">

          {/* ── Left: Form card ── */}
          <div className="bg-white rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] border border-white p-8 lg:p-10">
            <div className="mb-9">
              <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-emerald-500 mb-3">
                AI Listing Copy
              </p>
              <h2 className="text-[2rem] font-extrabold text-gray-900 leading-[1.15] tracking-tight">
                Stop typing.<br />
                <span className="text-emerald-500">Start selling.</span>
              </h2>
              <p className="text-[15px] text-gray-400 mt-3 leading-relaxed">
                Describe your listing — get polished copy for Facebook, WhatsApp &amp; PropertyGuru in English, BM &amp; 中文.
              </p>
            </div>

            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <label className={labelClass}>
                  Property Type <span className="text-red-400 normal-case tracking-normal">*</span>
                </label>
                <select
                  required
                  value={form.propertyType}
                  onChange={(e) => setField("propertyType", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select type…</option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Location <span className="text-red-400 normal-case tracking-normal">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Mont Kiara, KLCC, Petaling Jaya"
                  value={form.location}
                  onChange={(e) => setField("location", e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Property Details</label>
                <textarea
                  rows={5}
                  placeholder="e.g. 3 bed 2 bath, 1,200 sqft, RM 850,000, fully furnished, corner unit, freehold, golf view"
                  value={form.propertyDetails}
                  onChange={(e) => setField("propertyDetails", e.target.value)}
                  className={`${inputClass} resize-none leading-relaxed`}
                />
                <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
                  Include beds, baths, size, price, tenure, furnishing, views, nearby amenities — the more detail, the better the copy.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-[15px] tracking-wide shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:shadow-[0_6px_28px_rgba(16,185,129,0.45)] hover:-translate-y-px transition-all duration-150"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2.5">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Writing your listing copy…
                    </span>
                  ) : (
                    "✦ Generate Listing Copy"
                  )}
                </button>
                <p className="text-center text-[11px] text-gray-400 tracking-wide">
                  9 copy variants &nbsp;·&nbsp; 3 languages &nbsp;·&nbsp; ready in ~10 seconds
                </p>
              </div>
            </form>
          </div>

          {/* ── Right: Results card ── */}
          <div className="bg-white rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] border border-white p-8 lg:p-10 min-h-[520px] flex flex-col">

            {!result && !loading && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="flex gap-3 mb-6">
                  {(["facebook_caption", "whatsapp_pitch", "propertyguru_description"] as Variant[]).map((v) => (
                    <div
                      key={v}
                      className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-lg"
                    >
                      {VARIANT_META[v].icon}
                    </div>
                  ))}
                </div>
                <p className="text-base font-semibold text-gray-300 tracking-tight">
                  Your listing copy will appear here
                </p>
                <p className="text-sm text-gray-200 mt-1.5">
                  Fill in the form and click Generate
                </p>
              </div>
            )}

            {loading && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-5">
                  <svg className="animate-spin h-5 w-5 text-emerald-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-gray-700 tracking-tight">Writing your listing copy…</p>
                <p className="text-sm text-gray-400 mt-1.5">Generating in English, BM &amp; 中文</p>
              </div>
            )}

            {result && langVariants && (
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Generated Copy</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Click any card to copy the text</p>
                  </div>
                </div>

                {/* Language tabs */}
                <div className="flex gap-2 bg-gray-50 p-1 rounded-xl w-fit">
                  {(["en", "bm", "zh"] as Language[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setActiveLang(lang)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        activeLang === lang
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {LANG_LABELS[lang]}
                    </button>
                  ))}
                </div>

                {/* Copy cards */}
                <div className="space-y-3">
                  {(
                    ["facebook_caption", "whatsapp_pitch", "propertyguru_description"] as Variant[]
                  ).map((v) => (
                    <CopyCard key={`${activeLang}-${v}`} variant={v} text={langVariants[v]} />
                  ))}
                </div>

                <button
                  onClick={() => setResult(null)}
                  className="text-sm text-gray-300 hover:text-gray-500 transition-colors self-start mt-1"
                >
                  ← Generate for another listing
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
