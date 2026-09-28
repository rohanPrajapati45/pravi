import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { accent: "#00D9FF" },
      fontFamily: {
        sans: ["Space Grotesk", "sans-serif"],
        mono: ["Fira Code", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
