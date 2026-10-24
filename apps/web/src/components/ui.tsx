import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-line bg-white p-5 ${className}`}>{children}</section>;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-medium whitespace-nowrap disabled:opacity-50";
const buttonTone = {
  primary: "bg-foreground text-white",
  secondary: "border border-line bg-white text-foreground",
};

export function Button({
  className = "",
  tone = "primary",
  ...props
}: ComponentProps<"button"> & { tone?: keyof typeof buttonTone }) {
  return <button className={`w-full ${buttonBase} ${buttonTone[tone]} ${className}`} {...props} />;
}

export function LinkButton({
  className = "",
  tone = "primary",
  ...props
}: ComponentProps<typeof Link> & { tone?: keyof typeof buttonTone }) {
  return <Link className={`${buttonBase} ${buttonTone[tone]} ${className}`} {...props} />;
}

export const inputClass = "w-full rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none focus:border-foreground";

export function Field({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-foreground/60">{label}</span>
      <input className={inputClass} {...props} />
    </label>
  );
}

export function Message({ tone = "error", children }: { tone?: "error" | "info"; children: ReactNode }) {
  if (!children) return null;
  const color = tone === "error" ? "text-red-600" : "text-foreground/60";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`text-sm ${color}`}>
      {children}
    </p>
  );
}

export const selectClass = inputClass;

export function Select({ label, children, ...props }: ComponentProps<"select"> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-foreground/60">{label}</span>
      <select className={selectClass} {...props}>
        {children}
      </select>
    </label>
  );
}

const chipTone = {
  neutral: "bg-soft text-foreground/60 [--dot:#a3a3a3]",
  accent: "bg-[#fff0ea] text-[#c2410c] [--dot:var(--accent)]",
  red: "bg-[#fdecec] text-red-600 [--dot:#dc2626]",
  green: "bg-[#e9f6ee] text-green-700 [--dot:#15803d]",
  amber: "bg-[#fdf4e3] text-amber-700 [--dot:#d97706]",
};
export type ChipTone = keyof typeof chipTone;

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${chipTone[tone]}`}>
      <span className="size-1.5 rounded-full bg-(--dot)" />
      {children}
    </span>
  );
}

/** One headline figure. The featured one (at most one per screen) carries the accent. */
export function Kpi({
  label,
  value,
  foot,
  featured = false,
}: {
  label: string;
  value: string;
  foot?: ReactNode;
  featured?: boolean;
}) {
  return (
    <section
      className={`@container flex min-w-0 flex-col gap-3 rounded-[20px] p-5 ${
        featured ? "bg-linear-150 from-[#ff8352] via-accent to-[#e04812] text-white" : "border border-line bg-white"
      }`}
    >
      <p className={`text-[13px] ${featured ? "text-white/85" : "text-foreground/60"}`}>{label}</p>
      {/* Full peso amounts are long: shrink the figure to fit a half-width card on a phone, never above 28px. */}
      <p className="leading-none font-medium tracking-tight whitespace-nowrap" style={{ fontSize: `min(28px, ${(180 / value.length).toFixed(1)}cqi)` }}>
        {value}
      </p>
      {foot && <p className={`text-xs ${featured ? "text-white/85" : "text-foreground/60"}`}>{foot}</p>}
    </section>
  );
}

/** A thin bar; `percent` is clamped to 0–100. */
export function Bar({ percent, tone = "ink" }: { percent: number; tone?: "ink" | "red" | "accent" }) {
  const color = { ink: "bg-foreground", red: "bg-red-600", accent: "bg-accent" }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#efefef]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-normal tracking-[-0.03em] md:text-[36px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-foreground/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm text-foreground/60">
      ‹ {children}
    </Link>
  );
}
