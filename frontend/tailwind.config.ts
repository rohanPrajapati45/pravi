import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        page: "#F7F9FB",
        surface: "#FFFFFF",
        line: "#E2E8F0",
        ink: "#0F172A",
        muted: "#64748B",
        accent: { DEFAULT: "#00D9FF", text: "#0891B2", soft: "#E0FAFF" },
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
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
