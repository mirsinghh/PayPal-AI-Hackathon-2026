import type { ReactNode, SVGProps } from "react";

type P = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

/** Small stroke icon set for V3. All decorative by default: the text beside each icon carries the meaning. */
function Icon({ size = 18, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const IconArrow = (p: P) => (
  <Icon {...p} className={`v3-arrow ${p.className ?? ""}`}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const IconX = (p: P) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);
export const IconInfo = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);
export const IconAlert = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </Icon>
);
export const IconLock = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);
export const IconTruck = (p: P) => (
  <Icon {...p}>
    <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
    <circle cx="7.5" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </Icon>
);
export const IconShield = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Icon>
);
export const IconReturn = (p: P) => (
  <Icon {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
);
export const IconPackage = (p: P) => (
  <Icon {...p}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </Icon>
);
export const IconPlay = (p: P) => (
  <Icon {...p} fill="currentColor">
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </Icon>
);
export const IconPause = (p: P) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Icon>
);
export const IconReplay = (p: P) => (
  <Icon {...p}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5" />
    <path d="M4 3.5v5h5" />
  </Icon>
);
export const IconSkip = (p: P) => (
  <Icon {...p}>
    <path d="M5 5.5v13l9-6.5-9-6.5ZM18 5v14" />
  </Icon>
);
export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const IconTag = (p: P) => (
  <Icon {...p}>
    <path d="M3 12.5V4h8.5L21 13.5 13.5 21 3 12.5Z" />
    <circle cx="7.5" cy="8.5" r="1.3" />
  </Icon>
);
export const IconBolt = (p: P) => (
  <Icon {...p}>
    <path d="M13 3 5 13.5h6L10 21l9-11h-6.5L13 3Z" />
  </Icon>
);
export const IconUser = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Icon>
);
export const IconChat = (p: P) => (
  <Icon {...p}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </Icon>
);
export const IconImage = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 18 5-5 4 4 3-3 4 4" />
  </Icon>
);
