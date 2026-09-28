import type { Config } from "tailwindcss";

// Design tokens — change here, applies everywhere.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        page: "#F4F6FA",
        surface: "#FFFFFF",
        line: "#E4E8F0",
        ink: "#0F172A",
        muted: "#64748B",
        accent: { DEFAULT: "#2563EB", hover: "#1D4ED8", text: "#1D4ED8", soft: "#EEF3FF" },
        navy: { DEFAULT: "#0B1324", 800: "#111B30", 700: "#1A2640", text: "#A7B2C8" },
        condition: {
          excellent: "#16A34A",
          good: "#65A30D",
          moderate: "#EAB308",
          poor: "#F97316",
          critical: "#DC2626"
        }
      },
      fontFamily: {
        heading: ["var(--font-heading)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 8px rgba(15, 23, 42, 0.04)",
        lift: "0 8px 24px rgba(15, 23, 42, 0.10)"
      },
      keyframes: {
        "slide-in": { from: { transform: "translateY(8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } }
      },
      animation: {
        "slide-in": "slide-in 180ms ease-out",
        "fade-in": "fade-in 150ms ease-out"
      }
    }
  },
  plugins: []
};

export default config;
