import { alpha, createTheme, type Theme, type ThemeOptions } from "@mui/material/styles";
import type { ResolvedTheme } from "./constants/settingsOptions";

export type { ResolvedTheme };

export const THEME_IDS: ResolvedTheme[] = ["light", "dark"];

// Inter ships inside the bundle (@fontsource-variable/inter), so the app makes no request to a font CDN.
const FONT_STACK =
  '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const MONO_FONT_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** Tokens MUI's Theme doesn't model: surfaces, elevation, nav colours and the three.js material colours. */
declare module "@mui/material/styles" {
  interface Theme {
    thingport: {
      pageBackground: string;
      /** Slightly recessed area on a surface: table heads, inputs at rest, code. */
      surfaceMuted: string;
      /** Stronger than `divider`: input outlines, outlined buttons. */
      borderStrong: string;
      shadowCard: string;
      shadowHover: string;
      shadowOverlay: string;
      modelColor: string;
      modelEmissive: string;
      /** A secondary accent that doesn't compete with the primary green. */
      altText: string;
      /** Separate from text.secondary so recoloring nav rows can't leak into unrelated UI. */
      navInactiveText: string;
      /** A `background` value. */
      selectedNavBackground: string;
      selectedNavText: string;
      /** Strongest text colour: titles and numbers. */
      headingText: string;
    };
  }
  interface ThemeOptions {
    thingport: Theme["thingport"];
  }
}

type ThemeDef = {
  mode: "light" | "dark";
  pageBackground: string;
  panel: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textDisabled: string;
  heading: string;
  /** Fills and focus rings. */
  accent: string;
  accentLight: string;
  accentDark: string;
  accentContrast: string;
  /** Accent used as text on the page background: must keep contrast. */
  accentText: string;
  altText: string;
  shadowCard: string;
  shadowHover: string;
  shadowOverlay: string;
  modelColor: string;
  modelEmissive: string;
  tooltipBg: string;
  tooltipText: string;
};

const THEME_DEFS: Record<ResolvedTheme, ThemeDef> = {
  light: {
    mode: "light",
    pageBackground: "#f6f7f9",
    panel: "#ffffff",
    surfaceMuted: "#f1f3f6",
    border: "#e5e8ed",
    borderStrong: "#d2d7df",
    text: "#1c212a",
    textMuted: "#5d6675",
    textDisabled: "#9aa3b2",
    heading: "#0f1319",
    accent: "#15803d",
    accentLight: "#22c55e",
    accentDark: "#116932",
    accentContrast: "#ffffff",
    accentText: "#15803d",
    altText: "#c2410c",
    shadowCard: "0 1px 2px rgba(16, 24, 40, 0.04)",
    shadowHover: "0 8px 24px -6px rgba(16, 24, 40, 0.14), 0 2px 6px rgba(16, 24, 40, 0.06)",
    shadowOverlay: "0 16px 48px -8px rgba(16, 24, 40, 0.22), 0 4px 12px rgba(16, 24, 40, 0.08)",
    modelColor: "#cbd5e1",
    modelEmissive: "#94a3b8",
    tooltipBg: "#1b2029",
    tooltipText: "#f4f6f9",
  },
  dark: {
    mode: "dark",
    pageBackground: "#0b0e12",
    panel: "#12161c",
    surfaceMuted: "#181d25",
    border: "#232a34",
    borderStrong: "#323b48",
    text: "#d5dae2",
    textMuted: "#9099a8",
    textDisabled: "#5f6978",
    heading: "#f3f5f8",
    accent: "#22c55e",
    accentLight: "#4ade80",
    accentDark: "#16a34a",
    accentContrast: "#04210f",
    accentText: "#4ade80",
    altText: "#fb923c",
    shadowCard: "0 1px 2px rgba(0, 0, 0, 0.3)",
    shadowHover: "0 10px 28px -6px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.3)",
    shadowOverlay: "0 18px 52px -8px rgba(0, 0, 0, 0.7), 0 4px 12px rgba(0, 0, 0, 0.4)",
    modelColor: "#e2e8f0",
    modelEmissive: "#475569",
    tooltipBg: "#e8ebf0",
    tooltipText: "#10141a",
  },
};

export function buildTheme(id: ResolvedTheme): Theme {
  const d = THEME_DEFS[id];
  const focusRing = `0 0 0 3px ${alpha(d.accent, d.mode === "dark" ? 0.32 : 0.22)}`;
  const options: ThemeOptions = {
    palette: {
      mode: d.mode,
      background: { default: d.pageBackground, paper: d.panel },
      primary: { main: d.accent, light: d.accentLight, dark: d.accentDark, contrastText: d.accentContrast },
      text: { primary: d.text, secondary: d.textMuted, disabled: d.textDisabled },
      divider: d.border,
      action: {
        selected: alpha(d.accent, d.mode === "dark" ? 0.16 : 0.1),
        hover: alpha(d.mode === "dark" ? "#ffffff" : "#0f1319", d.mode === "dark" ? 0.06 : 0.045),
        focus: alpha(d.accent, 0.16),
      },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: FONT_STACK,
      fontSize: 14,
      h1: { fontWeight: 700, letterSpacing: "-0.03em" },
      h2: { fontWeight: 700, letterSpacing: "-0.025em" },
      h3: { fontWeight: 700, letterSpacing: "-0.02em" },
      h4: { fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1.75rem", lineHeight: 1.2 },
      h5: { fontWeight: 650, letterSpacing: "-0.015em", fontSize: "1.375rem", lineHeight: 1.25 },
      h6: { fontWeight: 650, letterSpacing: "-0.01em", fontSize: "1.125rem", lineHeight: 1.3 },
      subtitle1: { fontWeight: 600, fontSize: "1rem" },
      subtitle2: { fontWeight: 600, fontSize: "0.875rem" },
      body1: { fontSize: "0.9375rem", lineHeight: 1.55 },
      body2: { fontSize: "0.875rem", lineHeight: 1.5 },
      caption: { fontSize: "0.75rem", lineHeight: 1.4 },
      button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
    },
    shadows: [
      "none",
      d.shadowCard,
      d.shadowCard,
      d.shadowHover,
      d.shadowHover,
      d.shadowHover,
      d.shadowHover,
      d.shadowHover,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
      d.shadowOverlay,
    ],
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { colorScheme: d.mode, WebkitTextSizeAdjust: "100%" },
          body: {
            backgroundColor: d.pageBackground,
            fontFeatureSettings: '"cv11", "ss01"',
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          },
          "::selection": { backgroundColor: alpha(d.accent, 0.28) },
          // Slim scrollbars that stay out of the way.
          "*": { scrollbarWidth: "thin", scrollbarColor: `${d.borderStrong} transparent` },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: d.borderStrong,
            borderRadius: 8,
            border: `3px solid ${d.pageBackground}`,
          },
          "*::-webkit-scrollbar-track": { background: "transparent" },
          "a:focus-visible, button:focus-visible, [role='button']:focus-visible, [tabindex]:focus-visible": {
            outline: `2px solid ${d.accent}`,
            outlineOffset: 2,
          },
          code: { fontFamily: MONO_FONT_STACK },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none", backgroundColor: d.panel },
          rounded: { borderRadius: 14 },
          outlined: { borderColor: d.border },
        },
      },
      MuiAppBar: { styleOverrides: { root: { backgroundColor: d.panel, color: d.text, boxShadow: "none" } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundColor: d.panel, borderColor: d.border } } },
      MuiButtonBase: { defaultProps: { disableRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: ({ ownerState }) => {
            const neutralHover = alpha(d.mode === "dark" ? "#ffffff" : "#0f1319", d.mode === "dark" ? 0.06 : 0.05);
            const primary = ownerState.color === "primary" || ownerState.color === undefined;
            return {
              borderRadius: 10,
              minHeight: 36,
              paddingInline: 14,
              transition: "background-color .15s, border-color .15s, box-shadow .15s",
              ...(ownerState.size === "small" && { minHeight: 30, paddingInline: 11, fontSize: "0.8125rem" }),
              ...(ownerState.size === "large" && { minHeight: 44, paddingInline: 20, fontSize: "0.9375rem" }),
              ...(ownerState.variant === "contained" && primary && { "&:hover": { backgroundColor: d.accentDark } }),
              ...(ownerState.variant === "outlined" &&
                (primary
                  ? {
                      color: d.accentText,
                      borderColor: alpha(d.accent, 0.5),
                      "&:hover": { borderColor: d.accent, backgroundColor: alpha(d.accent, 0.08) },
                    }
                  : ownerState.color === "inherit"
                    ? {}
                    : {})),
              ...(ownerState.variant === "outlined" &&
                ownerState.color === "inherit" && {
                  borderColor: d.borderStrong,
                  color: d.text,
                  backgroundColor: d.panel,
                  "&:hover": { borderColor: d.borderStrong, backgroundColor: neutralHover },
                }),
              ...(ownerState.variant === "text" &&
                (primary
                  ? { color: d.accentText, "&:hover": { backgroundColor: alpha(d.accent, 0.1) } }
                  : { "&:hover": { backgroundColor: neutralHover } })),
            };
          },
        },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: 10 } } },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { backgroundColor: d.surfaceMuted, borderRadius: 10, padding: 3, gap: 2 },
          grouped: {
            border: 0,
            borderRadius: 8,
            "&:not(:first-of-type)": { borderRadius: 8, marginLeft: 0 },
            "&:not(:last-of-type)": { borderRadius: 8 },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 600,
            color: d.textMuted,
            paddingInline: 12,
            "&.Mui-selected": {
              color: d.heading,
              backgroundColor: d.panel,
              boxShadow: d.shadowCard,
              "&:hover": { backgroundColor: d.panel },
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            backgroundColor: d.panel,
            transition: "box-shadow .15s",
            "& .MuiOutlinedInput-notchedOutline": { borderColor: d.borderStrong },
            "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: d.textDisabled },
            "&.Mui-focused": { boxShadow: focusRing },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: d.accent, borderWidth: 1 },
          },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { "&.Mui-focused": { color: d.accentText } } } },
      MuiSelect: { styleOverrides: { icon: { color: d.textMuted } } },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 500 },
          sizeSmall: { height: 24 },
          outlined: { borderColor: d.borderStrong },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: false, enterDelay: 350 },
        styleOverrides: {
          tooltip: {
            backgroundColor: d.tooltipBg,
            color: d.tooltipText,
            fontSize: "0.75rem",
            fontWeight: 500,
            padding: "6px 10px",
            borderRadius: 8,
            boxShadow: d.shadowOverlay,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 18, border: `1px solid ${d.border}`, boxShadow: d.shadowOverlay },
        },
      },
      MuiDialogTitle: { styleOverrides: { root: { fontWeight: 650, fontSize: "1.125rem", letterSpacing: "-0.01em", paddingBottom: 8 } } },
      MuiDialogActions: { styleOverrides: { root: { padding: "12px 24px 20px", gap: 4 } } },
      MuiBackdrop: {
        styleOverrides: {
          root: { backgroundColor: d.mode === "dark" ? "rgba(3, 5, 8, 0.66)" : "rgba(15, 19, 25, 0.38)", backdropFilter: "blur(3px)" },
          invisible: { backdropFilter: "none", backgroundColor: "transparent" },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { borderRadius: 14, border: `1px solid ${d.border}`, boxShadow: d.shadowOverlay },
        },
      },
      MuiMenu: { styleOverrides: { list: { padding: 6 } } },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            minHeight: 36,
            fontSize: "0.875rem",
            "&.Mui-selected": { backgroundColor: alpha(d.accent, 0.12) },
          },
        },
      },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: 10 } } },
      MuiListItemIcon: { styleOverrides: { root: { minWidth: 36, color: "inherit" } } },
      MuiDivider: { styleOverrides: { root: { borderColor: d.border } } },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40 },
          indicator: { height: 2, borderRadius: 2, backgroundColor: d.accent },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 600, minHeight: 40, "&.Mui-selected": { color: d.accentText } },
        },
      },
      MuiTableHead: { styleOverrides: { root: { "& .MuiTableCell-root": { backgroundColor: d.surfaceMuted, color: d.textMuted, fontWeight: 600, fontSize: "0.75rem", letterSpacing: "0.02em", textTransform: "uppercase" } } } },
      MuiTableCell: { styleOverrides: { root: { borderColor: d.border, paddingBlock: 10 } } },
      MuiTableRow: { styleOverrides: { root: { "&.MuiTableRow-hover:hover": { backgroundColor: alpha(d.mode === "dark" ? "#fff" : "#0f1319", 0.03) } } } },
      MuiLink: { defaultProps: { underline: "hover" }, styleOverrides: { root: { color: d.accentText, fontWeight: 500 } } },
      MuiSkeleton: { styleOverrides: { root: { backgroundColor: alpha(d.mode === "dark" ? "#fff" : "#0f1319", d.mode === "dark" ? 0.07 : 0.07) } } },
      MuiSwitch: {
        styleOverrides: {
          switchBase: { "&.Mui-checked + .MuiSwitch-track": { opacity: 1 } },
        },
      },
      MuiAvatar: { styleOverrides: { root: { fontWeight: 600, fontSize: "0.8125rem" } } },
      MuiAlert: {
        styleOverrides: {
          root: ({ ownerState, theme }) => {
            if (ownerState.variant === "filled") {
              return ownerState.severity === "success"
                ? { backgroundColor: d.accent, color: d.accentContrast, borderRadius: 12 }
                : { borderRadius: 12 };
            }
            const severity = ownerState.severity ?? "success";
            const color = severity === "success" ? d.accentText : theme.palette[severity].main;
            return {
              borderRadius: 12,
              backgroundColor: alpha(color, d.mode === "dark" ? 0.1 : 0.08),
              border: `1px solid ${alpha(color, d.mode === "dark" ? 0.32 : 0.28)}`,
              color: d.text,
              "& .MuiAlert-icon": { color },
              "& .MuiAlertTitle-root": { color: d.heading, fontWeight: 650 },
            };
          },
        },
      },
    },
    thingport: {
      pageBackground: d.pageBackground,
      surfaceMuted: d.surfaceMuted,
      borderStrong: d.borderStrong,
      shadowCard: d.shadowCard,
      shadowHover: d.shadowHover,
      shadowOverlay: d.shadowOverlay,
      modelColor: d.modelColor,
      modelEmissive: d.modelEmissive,
      altText: d.altText,
      navInactiveText: d.textMuted,
      selectedNavBackground: alpha(d.accent, d.mode === "dark" ? 0.14 : 0.1),
      selectedNavText: d.accentText,
      headingText: d.heading,
    },
  };
  return createTheme(options);
}

export function subtleTextColor(id: ResolvedTheme): string {
  return THEME_DEFS[id].textMuted;
}

export function accentSoftColor(id: ResolvedTheme): string {
  return alpha(THEME_DEFS[id].accent, 0.14);
}

/** The border colour for container edges. Both themes draw a quiet outline now (dark mode used to
 *  have none); kept as a function so callers needn't change. */
export function dividerBorderColor(theme: Theme): string {
  return theme.palette.divider;
}
