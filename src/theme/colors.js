// Star Public School - Mobile Design System & Color Tokens
// Emerald & Forest Green Brand Theme matching the SPS Web Application

export const colors = {
  // Brand Emerald & Forest Greens
  primary: "#059669",        // Primary Action Emerald
  primaryDark: "#047857",    // Deep Emerald (Buttons, Headers)
  primaryDeep: "#064e3b",    // Dark Forest Green (Cards, Hero Backgrounds, Titles)
  primaryDeeper: "#022c22",  // Deepest Forest Shadow Tone
  primaryLight: "#10b981",   // Vibrant Emerald Accent (Badges, Active Borders)
  primaryLighter: "#34d399", // Light Emerald Highlight
  primarySoft: "#6ee7b7",    // Soft Mint Tint

  // Background Tints & Surfaces
  tintSoft: "#ecfdf5",       // Very Soft Emerald Tint (Active tabs, Pills, Chips)
  tintSubtle: "#f0fdf4",     // Light Green Tint
  tintBorder: "#d1fae5",     // Soft Emerald Border
  tintBorderActive: "#a7f3d0",// Active Emerald Border
  tintSurface: "#f4fbf7",    // Muted Surface Tint

  // Neutrals & Cards
  white: "#ffffff",
  background: "#f3f8f5",     // Clean Modern Pale Green-Gray Background
  surface: "#ffffff",        // Card Pure White
  cardBorder: "#e1ebe5",     // Subtle Crisp Border
  cardShadow: "#06372b",     // Forest Shadow
  cardShadowLight: "rgba(6, 78, 59, 0.08)",

  // Typography
  textPrimary: "#0f231c",    // Dark Forest Slate (Super high contrast & readable)
  textSecondary: "#2d4a3e",  // Medium Forest Slate
  textMuted: "#527365",      // Muted Green-Slate
  textLight: "#849e92",      // Light Green-Slate
  textInverse: "#ffffff",

  // Warm Accents (Gold & Amber for Badges / Icons / Highlights)
  gold: "#eab308",
  goldDark: "#ca8a04",
  goldLight: "#fef08a",
  goldBg: "#fefce8",
  goldBorder: "#fde047",

  // Status Tones
  success: "#16a34a",
  successBg: "#dcfce7",
  successBorder: "#86efac",
  successText: "#14532d",

  warning: "#d97706",
  warningBg: "#fef3c7",
  warningBorder: "#fde68a",
  warningText: "#78350f",

  danger: "#dc2626",
  dangerBg: "#fee2e2",
  dangerBorder: "#fca5a5",
  dangerText: "#7f1d1d",

  info: "#0284c7",
  infoBg: "#e0f2fe",
  infoBorder: "#bae6fd",
  infoText: "#0369a1",
};

export const shadows = {
  sm: {
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  md: {
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryGlow: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
};

export default colors;
