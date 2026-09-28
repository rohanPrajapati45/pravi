import type { SVGProps } from "react";

// Minimal stroke icon set (Lucide-style paths), inline to avoid a dependency.
const paths: Record<string, string[]> = {
  dashboard: ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
  tasks: ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  assets: ["M3 21h18", "M5 21V7l7-4 7 4v14", "M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6"],
  inspections: ["M9 11l3 3 8-8", "M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9", "M3 3l2 2"],
  maintenance: ["M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"],
  works: ["M2 20h20", "M5 20V10l7-6 7 6v10", "M10 20v-6h4v6"],
  programmes: ["M4 19V5", "M4 19h16", "M8 15l3-4 3 2 4-6"],
  audit: ["M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z", "M9 12l2 2 4-4"],
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  check: ["M20 6L9 17l-5-5"],
  alert: ["M12 9v4", "M12 17h.01", "M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  plus: ["M12 5v14", "M5 12h14"]
};

export type IconName = keyof typeof paths;

export default function Icon({ name, className = "h-4 w-4", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden {...rest}>
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
