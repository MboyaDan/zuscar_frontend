import Image from "next/image";
import { BRAND, type LogoVariant } from "@/lib/brand";

// Single swap point for brand artwork. Where each variant is used:
//   reversed      dark header band           icon / iconReversed  collapsed sidebar, mobile header
//   horizontal    login and not-found pages  onecolour            print templates only
// The receipt logo (public/brand/zuscar-receipt-logo.png) is for print templates only.
export function Logo({ variant, className }: { variant: LogoVariant; className?: string }) {
  const { src, width, height } = BRAND[variant];
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt="Zuscar"
      unoptimized
      priority
      className={className ?? "h-10 w-auto"}
    />
  );
}
