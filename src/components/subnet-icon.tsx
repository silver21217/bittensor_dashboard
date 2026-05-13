"use client";

import { memo, useEffect, useState } from "react";
import { BrandLogo } from "./brand-logo";

type Props = {
  netuid: number;
  name: string;
  symbol: string;
  logoUrl?: string | null;
  size?: number;
};

export const SubnetIcon = memo(function SubnetIcon({
  name,
  logoUrl,
  size = 28,
}: Props) {
  // Track whether the remote image loaded. Reset if logoUrl changes.
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl]);

  const hasLogo = !!logoUrl && logoUrl.trim() !== "" && !imgFailed;

  if (hasLogo) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center overflow-hidden"
        style={{
          width: size,
          height: size,
          borderRadius: 7,
          background: "var(--surface-2)",
        }}
        aria-label={name}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl as string}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            display: "block",
          }}
        />
      </span>
    );
  }

  // Default fallback for any subnet without a working logo — the τ brand
  // mark in its own tile. Matches subnet 0's canonical icon so the entire
  // table reads as a cohesive set instead of clashing coloured glyphs.
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BrandLogo size={size} />
    </span>
  );
});
