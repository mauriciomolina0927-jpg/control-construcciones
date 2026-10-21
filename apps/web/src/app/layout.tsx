import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Control de obra",
  description: "Casas, gastos, aportes y liquidación entre socios.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f4e79",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
