import fullSrc from "../../assets/brand/pro-order-full-logo.png";
import iconSrc from "../../assets/brand/pro-order-icon.png";

/**
 * Logo — official PRO·ORDER brand assets.
 *
 * variant="full"  → full logo (oval frame + wordmark + figure-8).
 *                   Use in: hero, splash, admin login, large brand areas.
 * variant="icon"  → compact figure-8 icon (stopwatch + plate), no text.
 *                   Use in: topbar, mobile header, tight/small spaces.
 *
 * size tokens (maps to CSS height):
 *   "nav"    → topbar / navigation          (icon: 40px, full: 48px)
 *   "sm"     → tight spaces                 (icon: 52px, full: 60px)
 *   "md"     → placeholders / cards         (icon: 72px, full: 100px)
 *   "lg"     → hero / welcome splash        (icon: 110px, full: 160px)
 *   "xl"     → admin login hero             (icon: 140px, full: 220px)
 *
 * To swap assets later: replace the two PNG files in src/assets/brand/
 * and keep the same file names — nothing else needs to change.
 */

const SIZE = {
  //           icon    full
  nav:  { icon: 40,  full:  48 },
  sm:   { icon: 52,  full:  60 },
  md:   { icon: 72,  full: 100 },
  lg:   { icon: 110, full: 160 },
  xl:   { icon: 140, full: 220 },
};

export default function Logo({
  variant = "icon",
  size    = "nav",
  className = "",
  style,
  ...rest
}) {
  const src    = variant === "full" ? fullSrc : iconSrc;
  const alt    = variant === "full" ? "PRO·ORDER" : "PRO·ORDER icon";
  const height = (SIZE[size] ?? SIZE.nav)[variant] ?? SIZE.nav.icon;

  return (
    <img
      src={src}
      alt={alt}
      className={`brand-logo brand-logo--${variant} brand-logo--${size} ${className}`}
      style={{ height, width: "auto", objectFit: "contain", display: "block", userSelect: "none", ...style }}
      draggable={false}
      {...rest}
    />
  );
}
