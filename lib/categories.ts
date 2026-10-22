import type { Category } from "@/lib/types";

/**
 * Display metadata shared by the map, feed and stats so colors stay consistent.
 * Tuned for the light Bahi-Khata paper theme (>= 3:1 against #fbf6ea for dots/bars):
 * mid-dark, saturated inks that stay distinct from each other and from the maroon chrome.
 */
export const CATEGORY_META: Record<Category, { label: string; hi: string; color: string }> = {
  flood: { label: "Flood & landslide", hi: "बाढ़ व भूस्खलन", color: "#1a6fc4" },
  cyclone: { label: "Cyclone", hi: "चक्रवात", color: "#7b3fc4" },
  weather: { label: "Rain & lightning", hi: "बारिश व बिजली", color: "#4a58c8" },
  heat: { label: "Heatwave", hi: "लू", color: "#e8730c" },
  earthquake: { label: "Earthquake", hi: "भूकंप", color: "#8a5a1c" },
  wildfire: { label: "Fire", hi: "आग", color: "#e0401a" },
  air: { label: "Air quality", hi: "वायु गुणवत्ता", color: "#8a78b8" },
  health: { label: "Health", hi: "स्वास्थ्य", color: "#c2308f" },
  security: { label: "Security & crime", hi: "सुरक्षा व अपराध", color: "#9c1230" },
  civic: { label: "Civic", hi: "नागरिक समस्या", color: "#6f8a1f" },
  infrastructure: { label: "Development", hi: "विकास कार्य", color: "#0e8aa6" },
  transport: { label: "Transport", hi: "परिवहन", color: "#d4608a" },
  politics: { label: "Politics & govt", hi: "राजनीति व सरकार", color: "#c99700" },
  economy: { label: "Economy", hi: "अर्थव्यवस्था", color: "#0f8a5f" },
  sports: { label: "Sports", hi: "खेल", color: "#3b4468" },
  other: { label: "Other", hi: "अन्य", color: "#8a8576" },
};
