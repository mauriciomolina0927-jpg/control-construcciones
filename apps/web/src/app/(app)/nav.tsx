"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const DESKTOP = [
  { href: "/", label: "Inicio" },
  { href: "/casas", label: "Casas" },
  { href: "/dinero", label: "Dinero" },
  { href: "/ventas", label: "Ventas" },
  { href: "/mas", label: "Socios" },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

/** Desktop: one pill row in the top bar. */
export function TopNav() {
  const active = useActive();
  return (
    <nav aria-label="Menú principal" className="flex gap-0.5 rounded-full border border-line bg-white p-1">
      {DESKTOP.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active(item.href) ? "page" : undefined}
          className={`rounded-full px-4 py-2 text-sm ${active(item.href) ? "bg-foreground font-medium text-white" : "text-foreground/60"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

const ICONS: Record<string, ReactNode> = {
  "/": <path d="M3 11 12 4l9 7M6 10v10h12V10" />,
  "/casas": <path d="M2 20h20M4 20V10l5-4 5 4v10M14 20v-7l4-3 4 3v7" />,
  "/dinero": (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  "/mas": (
    <>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </>
  ),
};

/** Phone: four sections and, for whoever registers money, the "+" in the middle. */
export function BottomNav({ canRegister }: { canRegister: boolean }) {
  const active = useActive();
  const item = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={active(href) ? "page" : undefined}
      className={`flex flex-col items-center gap-1 text-[11px] ${active(href) ? "font-medium text-foreground" : "text-foreground/40"}`}
    >
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[href]}
      </svg>
      {label}
    </Link>
  );

  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] grid grid-cols-5 items-center rounded-[26px] border border-line bg-white px-2 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.06)] md:hidden"
    >
      {item("/", "Inicio")}
      {item("/casas", "Casas")}
      {canRegister ? (
        <Link
          href="/gastos/nuevo"
          aria-label="Registrar"
          className="flex size-[52px] items-center justify-center justify-self-center rounded-full bg-foreground text-white"
        >
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      ) : (
        <span />
      )}
      {item("/dinero", "Dinero")}
      {item("/mas", "Más")}
    </nav>
  );
}
