// Quick-pick defect lists per asset category; officers can also type their own.
export const defectsByCategory: Record<string, string[]> = {
  ROAD: ["Potholes", "Alligator cracking", "Rutting", "Edge breaking", "Shoulder erosion", "Drain blocked", "Missing signage", "Faded markings"],
  BRIDGE: ["Deck cracking", "Expansion joint damage", "Bearing distress", "Scour at foundation", "Spalling / exposed rebar", "Railing damage", "Drainage spout blocked"],
  CULVERT: ["Silting", "Wing wall cracks", "Scour at outlet", "Headwall damage", "Vent blocked"],
  BUILDING: ["Roof leakage", "Wall cracks", "Dampness", "Plaster damage", "Electrical faults", "Plumbing leak", "Fire exit blocked"],
  EQUIPMENT: ["Not working", "Abnormal noise", "Safety device fault", "AMC lapsed", "Certificate expired"],
  ELECTRICAL: ["Lamps not working", "Pole damage", "Cable exposed", "Timer fault"]
};

export const conditionScale = [
  { rating: 5, label: "Excellent", className: "bg-condition-excellent" },
  { rating: 4, label: "Good", className: "bg-condition-good" },
  { rating: 3, label: "Moderate", className: "bg-condition-moderate" },
  { rating: 2, label: "Poor", className: "bg-condition-poor" },
  { rating: 1, label: "Critical", className: "bg-condition-critical" }
];
