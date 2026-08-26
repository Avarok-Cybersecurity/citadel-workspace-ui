import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          // For destructive TEXT on a normal background. `DEFAULT` is a
          // surface colour and is too dark to read as body text in dark mode.
          emphasis: "hsl(var(--destructive-emphasis))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* The Radix popper surface. index.css defines --popover and
           --popover-foreground, but this key was missing — so `.bg-popover`
           was never generated and every ui/ primitive asking for it
           (popover, tooltip, dropdown-menu, select, context-menu) rendered
           TRANSPARENT. Twenty-odd surfaces were patched one at a time with a
           local bg-card/bg-surface override; the rest, including the message
           context menu on every chat bubble, showed the page through them. */
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        /* Elevated surface: menus, popovers, hover and selected rows. The app
           had ~10 near-identical hexes doing this job; they collapse here. */
        surface: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--surface-foreground))",
        },
        /* The lighter brand tone, for accent text and icons on a dark surface.
           Distinct from `primary`, which is a button FILL and must carry
           primary-foreground text at AA. */
        "primary-accent": "hsl(var(--primary-accent))",
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "slide-in": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
        // A ring that swells outward and dissolves — the visual grammar of a
        // ringing phone. Deliberately slower and softer than animate-ping.
        "ring-pulse": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "70%": { transform: "scale(1.4)", opacity: "0" },
          "100%": { transform: "scale(1.4)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "fade-out": "fade-out 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "slide-out": "slide-out 0.3s ease-out",
        "shake": "shake 0.5s ease-in-out",
        "ring-pulse": "ring-pulse 2.4s ease-out infinite",
      },
      fontFamily: {
        sans: ["SF Pro Display", "system-ui", "sans-serif"],
        body: ["SF Pro Text", "system-ui", "sans-serif"],
      },
      typography: {
        DEFAULT: {
          css: {
            color: 'hsl(var(--foreground))',
            a: {
              color: 'hsl(var(--primary))',
              '&:hover': {
                color: 'hsl(var(--primary))',
              },
            },
            // List markers were left at Typography's default, gray-300, which
            // measures 1.47:1 against the light theme's white page — a bullet
            // nobody can see. The rest of the prose colours were tokenised and
            // these were missed, so the defect only existed in light mode.
            //
            // axe does not evaluate ::marker pseudo-elements, so the
            // accessibility suite passed over it in both schemes; it took
            // measuring the computed marker colour to find.
            //
            // muted-foreground is the right token rather than foreground: a
            // marker is structure, not content, and should read as secondary
            // without disappearing. It is defined per-theme, so one value
            // serves both — hence the same assignment for the invert variant,
            // which otherwise falls back to its own gray default.
            '--tw-prose-bullets': 'hsl(var(--muted-foreground))',
            '--tw-prose-counters': 'hsl(var(--muted-foreground))',
            '--tw-prose-invert-bullets': 'hsl(var(--muted-foreground))',
            '--tw-prose-invert-counters': 'hsl(var(--muted-foreground))',
          },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;