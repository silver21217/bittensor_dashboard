"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Measures an element's height and writes it into a CSS custom property
 * on document.documentElement. Re-runs on every size change so sticky
 * offsets stay exact regardless of viewport width or breakpoint changes.
 *
 *   const ref = useStickyHeight("--sticky-top-1");
 *   return <div ref={ref}>…</div>;
 */
export function useStickyHeight<T extends HTMLElement = HTMLDivElement>(
  varName: string,
) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const write = () => {
      document.documentElement.style.setProperty(
        varName,
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };

    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    window.addEventListener("resize", write);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", write);
    };
  }, [varName]);

  return ref;
}
