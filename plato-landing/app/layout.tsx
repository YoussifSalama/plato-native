import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Motion } from "@/components/motion";

// Same faces as the web app (plato-job-seeker-native-fe/app/layout.tsx).
const sans = Plus_Jakarta_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://platohiring.com"),
  title: { default: "Plato · Your job hunt, on autopilot", template: "%s · Plato" },
  description: "Plato searches 32 job sources, ranks every posting against your profile, and applies in your own browser. It asks you only for what it cannot know.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  openGraph: { title: "Plato · Your job hunt, on autopilot", description: "Search 32 sources, get every posting ranked against your profile, apply from your own browser.", url: "https://platohiring.com", siteName: "Plato", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Motion />
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
