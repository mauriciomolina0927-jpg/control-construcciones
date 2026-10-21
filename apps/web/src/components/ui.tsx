import type { ComponentProps, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-sm dark:bg-white/5 ${className}`}>{children}</section>
  );
}

export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      className={`w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function Field({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-base dark:border-white/20 dark:bg-white/10"
        {...props}
      />
    </label>
  );
}

export function Message({ tone = "error", children }: { tone?: "error" | "info"; children: ReactNode }) {
  if (!children) return null;
  const color = tone === "error" ? "text-red-700 dark:text-red-400" : "text-foreground/70";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`text-sm ${color}`}>
      {children}
    </p>
  );
}
