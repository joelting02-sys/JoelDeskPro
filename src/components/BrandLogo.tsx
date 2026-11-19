import { useId } from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * Luxury obsidian-black & brushed champagne-gold "J" monogram emblem for Joel Desk Pro.
 * Uses per-instance SVG gradient IDs via React useId() so hidden responsive copies
 * (e.g. desktop sidebar hidden on narrow viewports) never break url(#...) fills.
 */
export function BrandLogo({ size = 34, className = '' }: BrandLogoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const obsidianId = `jdp-obs-${uid}`;
  const frameId = `jdp-frm-${uid}`;
  const letterId = `jdp-ltr-${uid}`;
  const sheenId = `jdp-shn-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Joel Desk Pro"
      className={`block shrink-0 ${className}`}
    >
      <defs>
        {/* Obsidian Metallic Surface */}
        <radialGradient id={obsidianId} cx="30%" cy="22%" r="82%">
          <stop offset="0%" stopColor="#28272E" />
          <stop offset="48%" stopColor="#121217" />
          <stop offset="100%" stopColor="#07070A" />
        </radialGradient>

        {/* Brushed Champagne Gold Border */}
        <linearGradient id={frameId} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCE9A6" />
          <stop offset="32%" stopColor="#D6B13A" />
          <stop offset="68%" stopColor="#9C7521" />
          <stop offset="100%" stopColor="#F4D784" />
        </linearGradient>

        {/* Sculpted Gold Monogram Fill */}
        <linearGradient id={letterId} x1="18" y1="12" x2="46" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF2BF" />
          <stop offset="30%" stopColor="#E8C668" />
          <stop offset="65%" stopColor="#C99B33" />
          <stop offset="100%" stopColor="#F6DD8C" />
        </linearGradient>

        {/* Subtle Inner Sheen */}
        <linearGradient id={sheenId} x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8E29D" stopOpacity="0.38" />
          <stop offset="50%" stopColor="#D4AF37" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#F8E29D" stopOpacity="0.26" />
        </linearGradient>
      </defs>

      {/* Outer Obsidian Rounded Tile with Gold Frame */}
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill={`url(#${obsidianId})`}
        stroke={`url(#${frameId})`}
        strokeWidth="2.4"
      />

      {/* Precision Inner Chamfer Hairline */}
      <rect
        x="6.5"
        y="6.5"
        width="51"
        height="51"
        rx="12"
        stroke={`url(#${sheenId})`}
        strokeWidth="1"
      />

      {/* Bespoke Editorial Serif "J" Monogram */}
      <path
        d="M31.5 16.5H45.5V19.6C42.9 20 41.8 21.1 41.8 24.1V37.8C41.8 45.4 36.7 50 28.9 50C23.5 50 19.6 47.4 18.4 43.9C17.9 42.3 18.6 40.3 20.4 39.8C22 39.4 23.6 40.3 24.3 42C25.2 44.3 26.8 45.8 29.3 45.8C33.4 45.8 35.4 43 35.4 37.6V24.1C35.4 21.1 34.3 20 31.5 19.6V16.5Z"
        fill={`url(#${letterId})`}
      />

      {/* Subtle Diamond Accent Finial */}
      <path
        d="M21.5 19.5L23.2 17.8L24.9 19.5L23.2 21.2L21.5 19.5Z"
        fill={`url(#${letterId})`}
        fillOpacity="0.8"
      />
    </svg>
  );
}
