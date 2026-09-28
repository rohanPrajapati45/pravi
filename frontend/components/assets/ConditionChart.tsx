"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { inspected_at: string; condition_rating: number; type: string };
const labels = ["", "Critical", "Poor", "Moderate", "Good", "Excellent"];

export default function ConditionChart({ points }: { points: Point[] }) {
  const data = points.map((point) => ({
    date: new Date(point.inspected_at).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    rating: point.condition_rating,
    type: point.type
  }));
  return (
    <div className="h-48 w-full" role="img" aria-label={`Condition history: ${data.map((d) => `${d.date} ${d.rating}`).join(", ")}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <ReferenceArea y1={0.5} y2={2.5} fill="#F97316" fillOpacity={0.06} />
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={{ stroke: "#E2E8F0" }} />
          <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value) => [`${value} · ${labels[Number(value)] ?? ""}`, "Condition"]}
            contentStyle={{ borderRadius: 8, borderColor: "#E2E8F0", fontSize: 12 }}
          />
          <Line type="monotone" dataKey="rating" stroke="#0891B2" strokeWidth={2} dot={{ r: 4, fill: "#0891B2" }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
