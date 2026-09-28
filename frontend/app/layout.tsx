import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Pravi Hackathon",
  description: "Reusable hackathon application scaffold"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
