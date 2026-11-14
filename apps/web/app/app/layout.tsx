// Internal v1 workspace (/app): its own root layout, since the public site lives under app/[locale].
import type { Metadata, Viewport } from "next";
import "../globals.css";
import { fontClasses } from "../fonts";

export const metadata: Metadata = { title: { default: "FieldShift app", template: "%s · FieldShift" }, icons: { icon: "/brand/favicon.svg" }, robots: { index: false } };
export const viewport: Viewport = { themeColor: "#f7f6f1" };

export default function InternalLayout({ children }: LayoutProps<"/app">) {
  return (
    <html lang="ro" className={`${fontClasses} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
