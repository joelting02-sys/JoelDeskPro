interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * Clean White & Royal Blue "J" monogram emblem for Joel Desk Pro.
 * Pure white rounded tile with crisp blue border and sculpted blue "J".
 */
export function BrandLogo({ size = 34, className = '' }: BrandLogoProps) {
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
      {/* Pure White Rounded Tile with Crisp Blue Border */}
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="16"
        fill="#FFFFFF"
        stroke="#2563EB"
        strokeWidth="3.2"
      />

      {/* Sculpted Royal Blue "J" Monogram */}
      <path
        d="M31.5 16.5H45.5V20.2C42.9 20.6 41.8 21.7 41.8 24.6V37.6C41.8 45.2 36.7 49.8 28.9 49.8C23.5 49.8 19.6 47.2 18.4 43.7C17.9 42.1 18.6 40.2 20.4 39.7C22 39.3 23.6 40.2 24.3 41.9C25.2 44.1 26.8 45.5 29.3 45.5C33.4 45.5 35.4 42.8 35.4 37.4V24.6C35.4 21.7 34.3 20.6 31.5 20.2V16.5Z"
        fill="#2563EB"
      />
    </svg>
  );
}
