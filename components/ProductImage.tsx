import Image from "next/image";
import { IconImage } from "@/components/icons";

/**
 * Fixed-ratio product visual: the box reserves its space up front, so nothing shifts when the image loads.
 * Images are original category illustrations (SVG), so `unoptimized` is correct: there is nothing to
 * resize or re-encode, and next/image refuses to optimise SVG by default.
 */
export function ProductImage({
  src,
  alt,
  sizes = "96px",
  className = "",
  priority = false,
}: {
  src: string | null;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative aspect-square shrink-0 overflow-hidden rounded-md border border-line bg-subtle ${className}`}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} unoptimized priority={priority} className="object-contain" />
      ) : (
        <div role="img" aria-label={`No image available for ${alt}`} className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-2">
          <IconImage size={22} />
          <span className="text-caption">No image</span>
        </div>
      )}
    </div>
  );
}
