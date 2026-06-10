"use client";

import { useState, useEffect, useCallback } from "react";
import type { GeneratedCopy, CopyVariants } from "./api/generate/route";

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
const FURNISHING_OPTIONS = ["Unfurnished", "Partially Furnished", "Fully Furnished"];
const TENURE_OPTIONS = ["Freehold", "Leasehold (99 years)", "Leasehold (999 years)"];

const FREE_LIMIT = 3;

type Language = "en" | "bm" | "zh";
type Variant = "facebook_caption" | "whatsapp_pitch" | "propertyguru_description";

const LANG_LABELS: Record<Language, string> = {
  en: "English",
  bm: "Bahasa Malaysia",
  zh: "中文",
};

const VARIANT_META: Record<Variant, { label: string; icon: string; desc: string }> = {
  facebook_caption: {
    label: "Facebook",
    icon: "📘",
    desc: "Optimised for Facebook property groups",
  },
  whatsapp_pitch: {
    label: "WhatsApp",
    icon: "💬",
    desc: "Paste directly into WhatsApp",
  },
  propertyguru_description: {
    label: "PropertyGuru",
    icon: "🏠",
    desc: "Professional portal listing",
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
      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
        Pro ✓
      </span>
    );
  }
  const remaining = Math.max(0, FREE_LIMIT - count);
  if (remaining === 0) {
    return (
      <button
        onClick={onUpgrade}
        className="text-xs bg-amber-50 text-amber-700 border border-amber-300 px-2.5 py-1 rounded-full font-medium hover:bg-amber-100 transition-colors"
      >
        Upgrade to Pro ↗
      </button>
    );
  }
  return (
    <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2.5 py-1 rounded-full">
      {remaining} free {remaining === 1 ? "generation" : "generations"} left
    </span>
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
    <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3 bg-white">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-800">
            {meta.icon} {meta.label}
          </span>
          <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
        </div>
        <button
          onClick={handleCopy}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all border ${
            copied
              ? "bg-green-100 text-green-700 border-green-200"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200"
          }`}
        >
          {copied ? "✓ Copied!" : "Copy"}
        </button>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{text}</p>
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-5">
        <div className="text-center">
          <div className="text-4xl mb-3">✦</div>
          <h2 className="text-xl font-bold text-gray-900">Upgrade to Pro</h2>
          <p className="text-sm text-gray-500 mt-1">
            You&apos;ve used your {FREE_LIMIT} free generations. Upgrade for unlimited listings in all 3 languages.
          </p>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <span>✓</span>
            <span>Unlimited AI listing copy generation</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <span>✓</span>
            <span>All 3 formats — Facebook, WhatsApp, PropertyGuru</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <span>✓</span>
            <span>English, Bahasa Malaysia & Simplified Chinese</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <button
          onClick={handleUpgrade}
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          {loading ? "Redirecting to checkout…" : "Subscribe — RM49/month"}
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

export default function Home() {
  const [sessionId, setSessionId] = useState("");
  const [usageCount, setUsageCount] = useState(0);
  const [isPaid, setIsPaid] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [form, setForm] = useState({
    propertyType: "",
    bedrooms: "",
    bathrooms: "",
    builtUpSqft: "",
    landAreaSqft: "",
    furnishing: "",
    tenure: "",
    askingPriceMyr: "",
    location: "",
    highlights: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedCopy | null>(null);
  const [activeLang, setActiveLang] = useState<Language>("en");

  const isLanded = ["Terrace House", "Semi-Detached House", "Bungalow", "Land"].includes(
    form.propertyType
  );

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

    // Handle returning from a successful Stripe checkout
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setIsPaid(true);
      window.history.replaceState({}, "", "/");
    }

    fetchUsage(sid);
  }, [fetchUsage]);

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
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? parseInt(form.bathrooms) : undefined,
        builtUpSqft: form.builtUpSqft ? parseInt(form.builtUpSqft) : undefined,
        landAreaSqft: form.landAreaSqft ? parseInt(form.landAreaSqft) : undefined,
        furnishing: form.furnishing || undefined,
        tenure: form.tenure || undefined,
        askingPriceMyr: form.askingPriceMyr ? parseInt(form.askingPriceMyr) : undefined,
        location: form.location,
        highlights: form.highlights || undefined,
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
    <div className="min-h-screen bg-gray-50">
      {showUpgrade && sessionId && (
        <UpgradeModal
          sessionId={sessionId}
          onClose={() => setShowUpgrade(false)}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              ListingLah <span className="text-emerald-500">✦</span>
            </h1>
            <p className="text-xs text-gray-400">AI listing copy for Malaysian agents</p>
          </div>
          {sessionId && (
            <UsagePill
              count={usageCount}
              isPaid={isPaid}
              onUpgrade={() => setShowUpgrade(true)}
            />
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ── Left: Form ── */}
          <div>
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-gray-900">Generate Listing Copy</h2>
              <p className="text-gray-500 text-sm mt-1">
                Fill in the property details — get ready-to-use copy in English, BM &amp; 中文 in
                seconds.
              </p>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              {/* Property Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Type <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={form.propertyType}
                  onChange={(e) => setField("propertyType", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <option value="">Select type…</option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location / Area <span className="text-red-400">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Mont Kiara, KLCC, Petaling Jaya"
                  value={form.location}
                  onChange={(e) => setField("location", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {/* Beds + Baths */}
              {form.propertyType && form.propertyType !== "Land" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                    <input
                      type="number" min="0" max="20" placeholder="e.g. 3"
                      value={form.bedrooms}
                      onChange={(e) => setField("bedrooms", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                    <input
                      type="number" min="0" max="20" placeholder="e.g. 2"
                      value={form.bathrooms}
                      onChange={(e) => setField("bathrooms", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                </div>
              )}

              {/* Built-up + Land area */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Built-up (sqft)</label>
                  <input
                    type="number" min="0" placeholder="e.g. 1200"
                    value={form.builtUpSqft}
                    onChange={(e) => setField("builtUpSqft", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                {isLanded && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Land Area (sqft)</label>
                    <input
                      type="number" min="0" placeholder="e.g. 2400"
                      value={form.landAreaSqft}
                      onChange={(e) => setField("landAreaSqft", e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                )}
              </div>

              {/* Furnishing + Tenure */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Furnishing</label>
                  <select
                    value={form.furnishing}
                    onChange={(e) => setField("furnishing", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="">Select…</option>
                    {FURNISHING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tenure</label>
                  <select
                    value={form.tenure}
                    onChange={(e) => setField("tenure", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <option value="">Select…</option>
                    {TENURE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              {/* Asking Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Asking Price (RM)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">RM</span>
                  <input
                    type="number" min="0" placeholder="e.g. 650000"
                    value={form.askingPriceMyr}
                    onChange={(e) => setField("askingPriceMyr", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg pl-10 pr-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>

              {/* Highlights */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Key Highlights</label>
                <textarea
                  rows={3}
                  placeholder="e.g. KLCC view, pool access, near LRT station, newly renovated kitchen, pet-friendly…"
                  value={form.highlights}
                  onChange={(e) => setField("highlights", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <p className="text-xs text-gray-400 mt-1">
                  The more detail you give, the better the copy
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              {!isPaid && usageCount >= FREE_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setShowUpgrade(true)}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
                >
                  Upgrade to Pro to Generate More ↗
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Generating…
                    </span>
                  ) : (
                    "✦ Generate Listing Copy"
                  )}
                </button>
              )}
            </form>
          </div>

          {/* ── Right: Results ── */}
          <div>
            {!result && !loading && (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="text-6xl mb-4 text-gray-200">✦</div>
                <p className="text-base font-medium text-gray-400">
                  Your listing copy will appear here
                </p>
                <p className="text-sm text-gray-300 mt-1">Fill in the form and click Generate</p>
              </div>
            )}

            {loading && (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="text-4xl mb-4 animate-pulse text-emerald-400">✦</div>
                <p className="text-base font-medium text-gray-600">Writing your listing copy…</p>
                <p className="text-sm text-gray-400 mt-1">Generating in English, BM &amp; 中文</p>
              </div>
            )}

            {result && langVariants && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Generated Copy</h3>
                  <p className="text-sm text-gray-400">Click any Copy button to grab the text</p>
                </div>

                {/* Language tabs */}
                <div className="flex gap-2">
                  {(["en", "bm", "zh"] as Language[]).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setActiveLang(lang)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                        activeLang === lang
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"
                      }`}
                    >
                      {LANG_LABELS[lang]}
                    </button>
                  ))}
                </div>

                {/* Copy cards */}
                <div className="space-y-4">
                  {(["facebook_caption", "whatsapp_pitch", "propertyguru_description"] as Variant[]).map(
                    (v) => (
                      <CopyCard
                        key={`${activeLang}-${v}`}
                        variant={v}
                        text={langVariants[v]}
                      />
                    )
                  )}
                </div>

                <button
                  onClick={() => setResult(null)}
                  className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2"
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
