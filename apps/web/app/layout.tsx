import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: "FieldShift — climate risk for every field", template: "%s · FieldShift" },
  description:
    "Select your field on the map and see what 25 years of NASA satellite and weather data say about it: how much heat and drought your crop rotation can take, and which rotations hold.",
  icons: { icon: "/brand/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#f7f6f1" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ro" className={`${sans.variable} ${mono.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
