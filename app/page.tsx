"use client";

import { useState, useEffect, useCallback } from "react";
import type { GeneratedCopy, CopyVariants } from "./api/generate/route";
import type { HistoryItem } from "./api/history/route";
import type { AgentProfile } from "./api/profile/route";
import { FREE_LIMIT, isValidEmail } from "@/lib/constants";

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
type RefineTone = "punchier" | "formal" | "shorter";

const LANGUAGES: Language[] = ["en", "bm", "zh"];
const VARIANTS: Variant[] = ["facebook_caption", "whatsapp_pitch", "propertyguru_description"];

const LANG_META: Record<Language, { label: string; tag: string; accent: string }> = {
  en: { label: "English", tag: "EN", accent: "bg-blue-50 text-blue-700 border-blue-200" },
  bm: { label: "Bahasa Malaysia", tag: "BM", accent: "bg-purple-50 text-purple-700 border-purple-200" },
  zh: { label: "中文", tag: "ZH", accent: "bg-rose-50 text-rose-700 border-rose-200" },
};

const REFINE_OPTIONS: { tone: RefineTone; label: string }[] = [
  { tone: "punchier", label: "Punchier" },
  { tone: "formal", label: "More formal" },
  { tone: "shorter", label: "Shorten" },
];

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

/**
 * The email captured at the gate is used as the identity for usage tracking
 * (the `sessionId` the API keys `usage_sessions` on) and remembered locally so
 * returning visitors skip the gate. Clearing browser storage shows it again.
 */
const EMAIL_STORAGE_KEY = "ll_email";

/** Copy text to the clipboard, with a fallback for insecure/legacy contexts. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      // give up silently — nothing else we can do
    }
    document.body.removeChild(ta);
  }
}

/**
 * Open WhatsApp with the given text pre-filled. wa.me with no phone number opens
 * the contact/chat picker with the message ready to send — this resolves to the
 * native app on mobile and WhatsApp Web on desktop automatically.
 */
function shareToWhatsApp(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Small WhatsApp glyph used on share controls. */
function WhatsAppIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.53 0-3.03-.41-4.34-1.19l-.31-.18-3.12.82.83-3.04-.2-.32a8.2 8.2 0 01-1.26-4.36c0-4.54 3.7-8.24 8.24-8.24 4.54 0 8.24 3.7 8.24 8.24s-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" />
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmailGate({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const valid = isValidEmail(trimmed);
  const showInvalid = touched && trimmed.length > 0 && !valid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) {
      setError("Please enter a valid email address.");
      return;
    }

    const normalized = trimmed.toLowerCase();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not save your email. Please try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    localStorage.setItem(EMAIL_STORAGE_KEY, normalized);
    onSuccess(normalized);
  }

  return (
    <div className="min-h-screen bg-[#F5F4F0] flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-sm shadow-emerald-200">
              <span className="text-white text-sm font-bold leading-none">✦</span>
            </div>
            <span className="text-base font-bold text-gray-900 tracking-tight">ListingLah</span>
          </div>
        </div>
      </header>

      {/* ── Gate card ── */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] border border-white p-8 sm:p-10">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-200">
              <span className="text-white text-lg font-bold leading-none">✦</span>
            </div>
            <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-emerald-500 mb-3">
              AI Listing Copy
            </p>
            <h1 className="text-[1.75rem] font-extrabold text-gray-900 leading-[1.15] tracking-tight">
              Enter your email to start
            </h1>
            <p className="text-[15px] text-gray-400 mt-3 leading-relaxed">
              Get polished property copy for Facebook, WhatsApp &amp; PropertyGuru — in English, BM &amp; 中文. Your first {FREE_LIMIT} generations are free.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="gate-email" className={labelClass}>
                Email address
              </label>
              <input
                id="gate-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                onBlur={() => setTouched(true)}
                aria-invalid={showInvalid || !!error}
                aria-describedby={error || showInvalid ? "gate-email-error" : undefined}
                className={inputClass}
              />
              {(showInvalid || error) && (
                <p id="gate-email-error" role="alert" className="text-[13px] text-red-500 mt-2">
                  {error || "Please enter a valid email address."}
                </p>
              )}
            </div>

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
                  One moment…
                </span>
              ) : (
                "Start writing →"
              )}
            </button>

            <p className="text-center text-[11px] text-gray-400 tracking-wide leading-relaxed">
              No password, no spam — just so we can save your free generations.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

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
  // Urgency shifts with how many generations remain. The number itself stays
  // visible so the state is never conveyed by colour alone (a11y).
  const level = remaining >= 3 ? "ok" : remaining === 2 ? "warn" : "danger";
  const pillColor = {
    ok: "text-emerald-700 border-emerald-200 bg-emerald-50 font-medium",
    warn: "text-amber-700 border-amber-200 bg-amber-50 font-semibold",
    danger: "text-red-700 border-red-300 bg-red-50 font-bold",
  }[level];
  const dotColor = { ok: "bg-emerald-500", warn: "bg-amber-500", danger: "bg-red-500" }[level];
  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 ${pillColor}`}
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className={`w-1.5 h-1.5 rounded-full ${dotColor} ${level === "danger" ? "animate-pulse" : ""}`}
        />
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

function CopyCard({
  variant,
  text,
  language,
  onRefined,
}: {
  variant: Variant;
  text: string;
  language: Language;
  onRefined: (newText: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [refining, setRefining] = useState<RefineTone | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);
  const meta = VARIANT_META[variant];
  const langLabel = LANG_META[language].label;

  async function handleCopy() {
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRefine(tone: RefineTone) {
    setRefining(tone);
    setRefineError(null);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, tone, language, section: variant }),
      });
      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || "Couldn't refine this. Try again.");
      onRefined(data.text);
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : "Couldn't refine this.");
    } finally {
      setRefining(null);
    }
  }

  return (
    <div className="relative bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${meta.stripe}`} />
      <div className="pl-5 pr-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {meta.icon}&nbsp; {meta.label}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              aria-label={
                copied
                  ? `${meta.label} ${langLabel} copy copied to clipboard`
                  : `Copy ${meta.label} ${langLabel} copy to clipboard`
              }
              className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                copied
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent"
              }`}
            >
              <span aria-live="polite">{copied ? "✓ Copied!" : "Copy"}</span>
            </button>
            <button
              type="button"
              onClick={() => shareToWhatsApp(text)}
              aria-label={`Share ${meta.label} ${langLabel} copy to WhatsApp`}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-semibold bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20 border border-transparent transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <WhatsAppIcon />
              Share
            </button>
          </div>
        </div>

        <div className="relative">
          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{text}</p>
          {refining && (
            <div className="absolute inset-0 -m-1 bg-white/70 backdrop-blur-[1px] rounded-lg flex items-center justify-center">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Refining…
              </span>
            </div>
          )}
        </div>

        {/* Lightweight per-section refine — does NOT use a free generation. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-50 pt-3">
          <span className="text-[11px] font-semibold text-gray-400 mr-0.5">✨ Refine:</span>
          {REFINE_OPTIONS.map((opt) => (
            <button
              key={opt.tone}
              type="button"
              disabled={!!refining}
              onClick={() => handleRefine(opt.tone)}
              className="text-[11px] px-2 py-1 rounded-md font-medium text-gray-600 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-100 hover:border-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {opt.label}
            </button>
          ))}
        </div>
        {refineError && (
          <p role="alert" className="text-[11px] text-red-500 mt-1.5">
            {refineError}
          </p>
        )}
      </div>
    </div>
  );
}

function HeadlineList({ headlines, language }: { headlines: string[]; language: Language }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const langLabel = LANG_META[language].label;

  if (!headlines || headlines.length === 0) return null;

  async function handleCopy(idx: number, text: string) {
    await copyToClipboard(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 2000);
  }

  return (
    <div className="bg-gray-50/70 border border-gray-100 rounded-2xl p-3.5">
      <p className="text-[11px] font-bold tracking-wider uppercase text-gray-400 mb-2.5">
        ✦ Headline options
      </p>
      <ul className="space-y-1.5">
        {headlines.map((h, i) => {
          const isPicked = picked === i;
          return (
            <li
              key={i}
              className={`group flex items-start gap-2 rounded-xl border px-2.5 py-2 transition-colors ${
                isPicked ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100"
              }`}
            >
              <button
                type="button"
                onClick={() => setPicked(isPicked ? null : i)}
                aria-label={isPicked ? `Unpick headline ${i + 1}` : `Pick headline ${i + 1} as favourite`}
                aria-pressed={isPicked}
                className={`shrink-0 mt-0.5 text-sm leading-none focus:outline-none focus:ring-2 focus:ring-amber-400 rounded ${
                  isPicked ? "text-amber-500" : "text-gray-300 hover:text-amber-400"
                }`}
              >
                {isPicked ? "★" : "☆"}
              </button>
              <span className="flex-1 text-[13px] text-gray-700 leading-snug">{h}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleCopy(i, h)}
                  aria-label={copiedIdx === i ? "Headline copied" : `Copy headline ${i + 1}`}
                  className="text-[11px] px-1.5 py-0.5 rounded font-semibold text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-colors"
                >
                  <span aria-live="polite">{copiedIdx === i ? "✓" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => shareToWhatsApp(h)}
                  aria-label={`Share headline ${i + 1} to WhatsApp — ${langLabel}`}
                  className="p-1 rounded text-[#128C7E] hover:bg-[#25D366]/15 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-colors"
                >
                  <WhatsAppIcon className="w-3 h-3" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LanguageColumn({
  language,
  variants,
  onRefined,
}: {
  language: Language;
  variants: CopyVariants;
  onRefined: (section: Variant, text: string) => void;
}) {
  const meta = LANG_META[language];
  return (
    <section aria-label={`${meta.label} copy`} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.accent}`}
        >
          {meta.tag}
        </span>
        <span className="text-sm font-semibold text-gray-700">{meta.label}</span>
      </div>
      <HeadlineList headlines={variants.headlines} language={language} />
      <div className="flex flex-col gap-3">
        {VARIANTS.map((v) => (
          <CopyCard
            key={v}
            variant={v}
            text={variants[v]}
            language={language}
            onRefined={(t) => onRefined(v, t)}
          />
        ))}
      </div>
    </section>
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

function ProfileModal({
  sessionId,
  initial,
  onClose,
  onSaved,
}: {
  sessionId: string;
  initial: AgentProfile;
  onClose: () => void;
  onSaved: (profile: AgentProfile) => void;
}) {
  const [form, setForm] = useState<AgentProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setField(key: keyof AgentProfile, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your profile.");
      onSaved(data.profile ?? form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 id="profile-title" className="text-lg font-bold text-gray-900 tracking-tight">
              Your Agent Profile
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
              Add your details once — turn on &ldquo;Add my contact info&rdquo; when generating to
              weave a viewing CTA into your copy.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="shrink-0 -mr-1 -mt-1 w-9 h-9 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-colors flex items-center justify-center"
          >
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label htmlFor="pf-name" className={labelClass}>Name</label>
            <input
              id="pf-name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Sarah Tan"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pf-agency" className={labelClass}>Agency Name</label>
            <input
              id="pf-agency"
              type="text"
              placeholder="e.g. IQI Realty"
              value={form.agencyName}
              onChange={(e) => setField("agencyName", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pf-whatsapp" className={labelClass}>WhatsApp Number</label>
            <input
              id="pf-whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="e.g. +60 12-345 6789"
              value={form.whatsappNumber}
              onChange={(e) => setField("whatsappNumber", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pf-tagline" className={labelClass}>
              Tagline <span className="text-gray-300 normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="pf-tagline"
              type="text"
              placeholder="e.g. Your Mont Kiara specialist"
              value={form.tagline}
              onChange={(e) => setField("tagline", e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3 rounded-2xl text-sm tracking-wide shadow-lg shadow-emerald-200 transition-colors"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryModal({
  items,
  loading,
  onClose,
  onSelect,
}: {
  items: HistoryItem[];
  loading: boolean;
  onClose: () => void;
  onSelect: (item: HistoryItem) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 id="history-title" className="text-lg font-bold text-gray-900 tracking-tight">
              Recent Listings
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              View or copy any of your recent generations again.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recent listings"
            className="shrink-0 -mr-1 -mt-1 w-9 h-9 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-colors flex items-center justify-center"
          >
            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="animate-spin h-5 w-5 text-emerald-500 mb-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm text-gray-400">Loading your history…</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <div className="w-11 h-11 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-lg mb-3">
                🕘
              </div>
              <p className="text-sm font-semibold text-gray-500">No listings yet</p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Generate your first listing and it&apos;ll show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="w-full text-left rounded-2xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/40 px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {item.propertyType || "Listing"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">📍 {item.location}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{formatHistoryDate(item.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
  // `sessionId` is the captured email — the identity usage is tracked against.
  const [sessionId, setSessionId] = useState("");
  const [initializing, setInitializing] = useState(true);
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

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  // Whether to weave the saved contact CTA into this generation's copy.
  const [includeContact, setIncludeContact] = useState(true);

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

  const fetchHistory = useCallback(async (sid: string) => {
    if (!sid) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/history?sessionId=${encodeURIComponent(sid)}`);
      const data = await res.json();
      setHistory(Array.isArray(data.items) ? data.items : []);
    } catch {
      // non-fatal — history is a convenience, not core to generating
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchProfile = useCallback(async (sid: string) => {
    if (!sid) return;
    try {
      const res = await fetch(`/api/profile?sessionId=${encodeURIComponent(sid)}`);
      const data = await res.json();
      setProfile(data.profile ?? null);
    } catch {
      // non-fatal — profile is optional
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(EMAIL_STORAGE_KEY);
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setIsPaid(true);
      window.history.replaceState({}, "", "/");
    }
    if (stored && isValidEmail(stored)) {
      setSessionId(stored);
      fetchUsage(stored);
      fetchHistory(stored);
      fetchProfile(stored);
    }
    setInitializing(false);
  }, [fetchUsage, fetchHistory, fetchProfile]);

  // Called by the email gate once a valid email is captured and stored.
  const handleGateSuccess = useCallback(
    (email: string) => {
      setSessionId(email);
      fetchUsage(email);
      fetchHistory(email);
      fetchProfile(email);
    },
    [fetchUsage, fetchHistory, fetchProfile]
  );

  // Does the saved profile carry anything worth injecting as a contact CTA?
  const profileHasContact = !!(profile && (profile.name || profile.whatsappNumber));

  function openHistory() {
    setMenuOpen(false);
    setShowHistory(true);
    fetchHistory(sessionId); // refresh on open
  }

  function openProfile() {
    setMenuOpen(false);
    setShowProfile(true);
  }

  // Load a past generation back into the results view (no new generation).
  function handleSelectHistory(item: HistoryItem) {
    setResult(item.generated);
    setError(null);
    setShowHistory(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Replace a single variant's text in place after a lightweight refine.
  function updateVariant(lang: Language, section: Variant, text: string) {
    setResult((prev) =>
      prev ? { ...prev, [lang]: { ...prev[lang], [section]: text } } : prev
    );
  }

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
        includeContact: includeContact && profileHasContact,
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
      fetchHistory(sessionId); // keep the recent-listings panel in sync
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Avoid flashing the gate for returning visitors while we read localStorage.
  if (initializing) {
    return <div className="min-h-screen bg-[#F5F4F0]" />;
  }

  // No captured email yet → show the one-time email gate before the app.
  if (!sessionId) {
    return <EmailGate onSuccess={handleGateSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#F5F4F0]">
      {showUpgrade && sessionId && (
        <UpgradeModal sessionId={sessionId} onClose={() => setShowUpgrade(false)} />
      )}

      {showHistory && (
        <HistoryModal
          items={history}
          loading={historyLoading}
          onClose={() => setShowHistory(false)}
          onSelect={handleSelectHistory}
        />
      )}

      {showProfile && (
        <ProfileModal
          sessionId={sessionId}
          initial={profile ?? { name: "", agencyName: "", whatsappNumber: "", tagline: "" }}
          onClose={() => setShowProfile(false)}
          onSaved={(p) => setProfile(p)}
        />
      )}

      {/* ── Header ── */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-sm shadow-emerald-200">
              <span className="text-white text-sm font-bold leading-none">✦</span>
            </div>
            <span className="text-base font-bold text-gray-900 tracking-tight">ListingLah</span>
          </div>

          {/* Desktop (md+): Profile + Recent listings + usage pill inline */}
          {sessionId && (
            <div className="hidden md:flex items-center gap-3">
              <button
                type="button"
                onClick={openProfile}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 font-medium inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
                {profileHasContact ? "Edit Profile" : "Add Profile"}
              </button>
              <button
                type="button"
                onClick={openHistory}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 font-medium inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                Recent{history.length ? ` (${history.length})` : ""}
              </button>
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
          <div id="mobile-menu" className="md:hidden border-t border-gray-100 px-6 py-4 flex flex-col items-end gap-3">
            <button
              type="button"
              onClick={openProfile}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 font-medium inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
              </svg>
              {profileHasContact ? "Edit Profile" : "Add Profile"}
            </button>
            <button
              type="button"
              onClick={openHistory}
              className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 font-medium inline-flex items-center gap-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Recent Listings{history.length ? ` (${history.length})` : ""}
            </button>
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
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(340px,380px)_1fr] gap-6 items-start">

          {/* ── Left: Form card ── */}
          <div className="bg-white rounded-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] border border-white p-8 lg:p-9 lg:sticky lg:top-24">
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

              {/* Contact CTA toggle — only meaningful once a profile exists. */}
              {profileHasContact ? (
                <label className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeContact}
                    onChange={(e) => setIncludeContact(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 accent-emerald-500"
                  />
                  <span className="text-[13px] text-gray-600 leading-snug">
                    <span className="font-semibold text-gray-700">Add my contact info</span> to the copy
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      Weaves a viewing CTA with your name &amp; WhatsApp into each variant.
                    </span>
                  </span>
                </label>
              ) : (
                <button
                  type="button"
                  onClick={openProfile}
                  className="w-full text-left rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-3 text-[13px] text-gray-500 hover:border-emerald-300 hover:text-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <span className="font-semibold">+ Add your agent profile</span> to auto-insert a contact CTA into your copy.
                </button>
              )}

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
                  5 headlines + 9 copy variants &nbsp;·&nbsp; 3 languages &nbsp;·&nbsp; ready in ~15 seconds
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

            {result && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Generated Copy</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      All three languages side by side — copy, share, or refine any part.
                    </p>
                  </div>
                  <button
                    onClick={() => setResult(null)}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    ← New listing
                  </button>
                </div>

                {/* Side-by-side on wide screens; stacks vertically on smaller ones. */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                  {LANGUAGES.map((lang) => (
                    <LanguageColumn
                      key={lang}
                      language={lang}
                      variants={result[lang]}
                      onRefined={(section, text) => updateVariant(lang, section, text)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
