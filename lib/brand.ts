// Dimensions are the viewBox sizes of the supplied artwork (checked by scripts/check-brand.mjs).
// The artwork itself is never redrawn, recoloured or traced.
export const BRAND = {
  horizontal: { src: "/brand/zuscar-logo-horizontal.svg", width: 707, height: 250 },
  reversed: { src: "/brand/zuscar-logo-reversed.svg", width: 707, height: 250 },
  onecolour: { src: "/brand/zuscar-logo-onecolour.svg", width: 707, height: 250 },
  icon: { src: "/brand/zuscar-icon.svg", width: 640, height: 640 },
  iconReversed: { src: "/brand/zuscar-icon-reversed.svg", width: 640, height: 640 },
  favicon: { src: "/brand/zuscar-favicon.svg", width: 64, height: 64 },
} as const;

export type LogoVariant = keyof typeof BRAND;
