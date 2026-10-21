"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Hoy" },
  { href: "/casas", label: "Casas" },
  { href: "/dinero", label: "Dinero" },
  { href: "/ventas", label: "Ventas" },
  { href: "/mas", label: "Más" },
];

export function BottomNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/10 dark:bg-[#0f1720]">
      <ul className="mx-auto flex max-w-xl">
        {ITEMS.map((item) => (
          <li key={item.href} className="flex-1">
            <Link
              href={item.href}
              aria-current={active(item.href) ? "page" : undefined}
              className={`block py-3 text-center text-sm ${active(item.href) ? "font-semibold text-brand" : "text-foreground/60"}`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
