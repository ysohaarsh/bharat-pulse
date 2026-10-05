import type { Category } from "@/lib/types";

/**
 * Display metadata shared by the map, feed and stats so colors stay consistent.
 * Tuned for the green-on-black theme: none of these sit close to the phosphor accent (#00ff88).
 */
export const CATEGORY_META: Record<Category, { label: string; hi: string; color: string }> = {
  flood: { label: "Flood & landslide", hi: "बाढ़ व भूस्खलन", color: "#3da9ff" },
  cyclone: { label: "Cyclone", hi: "चक्रवात", color: "#b388ff" },
  weather: { label: "Rain & lightning", hi: "बारिश व बिजली", color: "#7c9cff" },
  heat: { label: "Heatwave", hi: "लू", color: "#ff7a1a" },
  earthquake: { label: "Earthquake", hi: "भूकंप", color: "#ffb347" },
  wildfire: { label: "Fire", hi: "आग", color: "#ff5a36" },
  air: { label: "Air quality", hi: "वायु गुणवत्ता", color: "#c8a2ff" },
  health: { label: "Health", hi: "स्वास्थ्य", color: "#e879f9" },
  security: { label: "Security & crime", hi: "सुरक्षा व अपराध", color: "#ff3355" },
  civic: { label: "Civic", hi: "नागरिक समस्या", color: "#f5e663" },
  infrastructure: { label: "Development", hi: "विकास कार्य", color: "#2fe0ff" },
  transport: { label: "Transport", hi: "परिवहन", color: "#ffa8c5" },
  politics: { label: "Politics & govt", hi: "राजनीति व सरकार", color: "#ffd23f" },
  economy: { label: "Economy", hi: "अर्थव्यवस्था", color: "#5eead4" },
  sports: { label: "Sports", hi: "खेल", color: "#e6edf3" },
  other: { label: "Other", hi: "अन्य", color: "#8aa898" },
};
