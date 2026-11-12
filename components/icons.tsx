import type { SVGProps } from "react";

/** One consistent icon set: 20px grid, 1.5 stroke, round caps. Decorative by default (aria-hidden). */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);
export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5.5 5.5 9 9m0-9-9 9" />
  </Icon>
);
export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10h12m-4.5-4.5L16 10l-4.5 4.5" />
  </Icon>
);
export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 10H4m4.5-4.5L4 10l4.5 4.5" />
  </Icon>
);
export const IconTruck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 5.5h9v8h-9zM11.5 8h3.2l2.3 2.6v2.9h-5.5" />
    <circle cx="6" cy="14.5" r="1.6" />
    <circle cx="14" cy="14.5" r="1.6" />
  </Icon>
);
export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.5 4 4.8v4.6c0 3.8 2.5 6.6 6 8.1 3.5-1.5 6-4.3 6-8.1V4.8z" />
    <path d="m7.5 10 1.8 1.8 3.3-3.6" />
  </Icon>
);
export const IconReturn = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4 3.5 7.5 7 11" />
    <path d="M3.5 7.5H12a4.5 4.5 0 0 1 0 9H8" />
  </Icon>
);
export const IconPackage = (p: IconProps) => (
  <Icon {...p}>
    <path d="m10 2.5 6.5 3.5v8L10 17.5 3.5 14V6z" />
    <path d="M3.5 6 10 9.5 16.5 6M10 9.5v8" />
  </Icon>
);
export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="2" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Icon>
);
export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v4.5M10 6.6v.01" />
  </Icon>
);
export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3 2.5 16h15z" />
    <path d="M10 8v3.5M10 14v.01" />
  </Icon>
);
export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 5.8V10l2.8 1.8" />
  </Icon>
);
export const IconSparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3c.6 3.6 1.9 5 6 6-4.1 1-5.4 2.4-6 6-.6-3.6-1.9-5-6-6 4.1-1 5.4-2.4 6-6z" />
  </Icon>
);
export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 7.5 5 5 5-5" />
  </Icon>
);
export const IconImage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="14" height="12" rx="2" />
    <circle cx="7.5" cy="8.5" r="1.2" />
    <path d="m3.5 14 4-3.5 3 2.5 2.5-2 3.5 3" />
  </Icon>
);
export const IconBuyer = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="7" r="3" />
    <path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" />
  </Icon>
);
