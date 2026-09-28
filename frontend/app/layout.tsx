import type { Metadata, Viewport } from "next";
import { Fira_Code, Inter, Space_Grotesk } from "next/font/google";
import "../styles/globals.css";
import Providers from "./providers";

const heading = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = Fira_Code({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "GujInfra 360",
  description: "Asset lifecycle management for Roads & Buildings infrastructure"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
