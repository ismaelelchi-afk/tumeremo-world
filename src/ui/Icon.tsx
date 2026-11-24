import type { SVGProps } from 'react';

const PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.3-4.3',
  close: 'M6 6l12 12M18 6 6 18',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
  pin: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  building: 'M4 21V6l8-3 8 3v15M4 21h16M9 9h2M13 9h2M9 13h2M13 13h2M10 21v-4h4v4',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 2.7 3S9.3 10.700 9.300 9c0 1.700 1.100 3 2.700 3s2.700-1.300 2.700-3c0 1.700 1.200 3 2.600 3S20 10.700 20 9M10 20v-5h4v5',
  tree: 'M12 22v-6M12 2a5 5 0 0 0-4 8 4.500 4.500 0 0 0 1 8.500h6A4.500 4.500 0 0 0 16 10a5 5 0 0 0-4-8Z',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  pointer: 'M5 3l14 7-6 2-2 6L5 3Z',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  rotate: 'M20 12a8 8 0 1 1-2.500-5.800M20 4v5h-5',
  scale: 'M4 14v6h6M20 10V4h-6M4 20 20 4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  road: 'M8 3 4 21M16 3l4 18M12 5v2M12 11v2M12 17v2',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  eyeOff: 'M3 3l18 18M10.600 6.100A9.500 9.500 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.200 3.800M6.600 6.600A17 17 0 0 0 2 12s4 7 10 7a9.500 9.500 0 0 0 4-.9',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 15V3M7 8l5-5 5 5M4 21h16',
  play: 'M7 4v16l13-8L7 4Z',
  back: 'M15 5l-7 7 7 7',
  check: 'M5 12.500 10 17.500 19 7',
  layers: 'm12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  cube: 'M12 2 3 7v10l9 5 9-5V7l-9-5ZM3 7l9 5 9-5M12 12v10',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14',
  external: 'M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  clipboard: 'M9 4h6v3H9zM7 5H5v16h14V5h-2',
  home: 'M3 11 12 3l9 8M5 10v10h14V10',
  save: 'M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  phone: 'M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  chevronUp: 'm6 15 6-6 6 6',
  chevronDown: 'm6 9 6 6 6-6',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Marca TUMEREMO: losango + trilha de rua. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6d27a" />
          <stop offset="1" stopColor="#e8b34b" />
        </linearGradient>
      </defs>
      <path d="M16 2 29 16 16 30 3 16Z" fill="url(#lg)" />
      <path d="M16 8 23 16 16 24 9 16Z" fill="#0a1014" />
      <path d="M16 12.500 19.500 16 16 19.500 12.500 16Z" fill="#5eead4" />
    </svg>
  );
}
