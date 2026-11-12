import type { SVGProps } from "react";

/**
 * Selective pixel illustrations: a handful of tiny SVGs drawn on a pixel grid with crisp edges. They are scenery
 * (always aria-hidden), used in Agent D's world only; no pixel type, no pixel UI.
 */
type Rect = [x: number, y: number, w: number, h: number, fill: string];

function Pixels({ w, h, rects, ...rest }: { w: number; h: number; rects: Rect[] } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden focusable="false" {...rest}>
      {rects.map(([x, y, rw, rh, fill], i) => (
        <rect key={i} x={x} y={y} width={rw} height={rh} fill={fill} />
      ))}
    </svg>
  );
}

const INK = "#1b1b5a";

export function PixelCloud(props: Omit<SVGProps<SVGSVGElement>, "viewBox">) {
  const w = "#ffffff";
  const s = "#dedbf7";
  return (
    <Pixels
      w={24}
      h={10}
      rects={[
        [8, 0, 6, 1, w], [6, 1, 10, 1, w], [3, 2, 7, 1, w], [13, 2, 6, 1, w], [2, 3, 20, 1, w], [1, 4, 22, 2, w], [0, 6, 24, 2, w],
        [1, 8, 22, 1, s], [3, 9, 18, 1, s],
      ]}
      {...props}
    />
  );
}

/** A little storefront with a striped awning in the given colour. 22x18 grid. */
export function PixelStore({ awning = "#3d5af1", ...props }: { awning?: string } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
  const rects: Rect[] = [
    // sign board
    [6, 0, 10, 3, INK], [7, 1, 8, 1, "#ffb347"],
    // awning outline + stripes
    [1, 3, 20, 1, INK], [0, 4, 22, 1, INK], [0, 5, 22, 3, INK],
  ];
  for (let i = 0; i < 10; i++) rects.push([1 + i * 2, 4, 2, 3, i % 2 ? "#ffffff" : awning]);
  rects.push(
    [1, 7, 20, 1, "#8f8cb5"],
    // walls
    [2, 8, 18, 9, INK], [3, 8, 16, 9, "#f4f2ff"],
    // window left + right
    [4, 10, 5, 4, INK], [5, 11, 3, 2, "#cfe0ff"], [13, 10, 5, 4, INK], [14, 11, 3, 2, "#cfe0ff"],
    // door
    [9, 10, 4, 7, INK], [10, 11, 2, 6, "#3d5af1"], [11, 14, 1, 1, "#ffb347"],
    // ground
    [0, 17, 22, 1, INK],
  );
  return <Pixels w={22} h={18} rects={rects} {...props} />;
}

export function PixelCoin(props: Omit<SVGProps<SVGSVGElement>, "viewBox">) {
  return (
    <Pixels
      w={10}
      h={10}
      rects={[
        [3, 0, 4, 1, INK], [2, 1, 6, 1, INK], [1, 2, 8, 6, INK], [2, 8, 6, 1, INK], [3, 9, 4, 1, INK],
        [3, 1, 4, 1, "#ffb347"], [2, 2, 6, 6, "#ffb347"], [3, 8, 4, 1, "#ffb347"],
        [4, 3, 2, 4, "#fff1d6"], [3, 4, 4, 1, "#fff1d6"],
      ]}
      {...props}
    />
  );
}

export function PixelSpark(props: Omit<SVGProps<SVGSVGElement>, "viewBox">) {
  return (
    <Pixels
      w={9}
      h={9}
      rects={[
        [4, 0, 1, 9, "#ffb347"], [0, 4, 9, 1, "#ffb347"], [3, 3, 3, 3, "#ffb347"], [4, 4, 1, 1, "#ffffff"],
        [2, 2, 1, 1, "#ffd48a"], [6, 2, 1, 1, "#ffd48a"], [2, 6, 1, 1, "#ffd48a"], [6, 6, 1, 1, "#ffd48a"],
      ]}
      {...props}
    />
  );
}

export function PixelTag({ fill = "#ffb347", ...props }: { fill?: string } & Omit<SVGProps<SVGSVGElement>, "viewBox">) {
  return (
    <Pixels
      w={12}
      h={10}
      rects={[
        [2, 0, 9, 1, INK], [1, 1, 11, 8, INK], [2, 9, 9, 1, INK],
        [2, 1, 9, 8, fill], [3, 3, 2, 2, INK], [6, 3, 4, 1, "#ffffff"], [6, 5, 3, 1, "#ffffff"],
      ]}
      {...props}
    />
  );
}
