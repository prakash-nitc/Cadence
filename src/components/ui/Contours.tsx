/**
 * The background layer — SPEC §8.
 *
 * Soft topographic contours, top-right and bottom-left, at a few per cent opacity. The
 * page ground was a flat fill; this gives it depth without giving it anything to look at.
 *
 * Abstract rather than decorative on purpose. The app is named after rhythm and measures
 * elevation of a sort, so contour lines say something; a botanical print would say
 * "wellness app", which this is not.
 *
 * Inline SVG rather than an asset: no request, no file, and the strokes take theme
 * colours so a palette change carries it along. `aria-hidden` and non-interactive — it
 * must never intercept a click or reach a screen reader.
 */
export function Contours() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none overflow-hidden"
    >
      {/* Top right: the denser cluster, behind the header and the summary column. */}
      <svg
        className="absolute -right-24 -top-40 h-[520px] w-[720px] text-signal opacity-[0.07]"
        viewBox="0 0 720 520"
        fill="none"
        preserveAspectRatio="xMaxYMin slice"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7].map((ring) => (
          <path
            key={ring}
            d={contour(ring)}
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </svg>

      {/* Bottom left: a quieter echo, so the page is not weighted to one corner. */}
      <svg
        className="absolute -bottom-56 -left-40 h-[460px] w-[620px] rotate-180 text-signal opacity-[0.05]"
        viewBox="0 0 720 520"
        fill="none"
        preserveAspectRatio="xMinYMax slice"
      >
        {[1, 3, 5, 7].map((ring) => (
          <path
            key={ring}
            d={contour(ring)}
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * One contour ring, `index` steps out from the centre.
 *
 * Deliberately not concentric circles: real contours are lopsided, and four control
 * points with uneven offsets read as terrain where an even ellipse reads as a target.
 */
function contour(index: number): string {
  const cx = 520;
  const cy = 150;
  const step = 46;
  const rx = 60 + index * step;
  const ry = 44 + index * step * 0.82;

  // A little asymmetry per ring, so no two are the same shape.
  const skew = 1 + index * 0.045;
  const lift = index * 7;

  return [
    `M ${cx - rx} ${cy + lift}`,
    `C ${cx - rx} ${cy - ry * 0.7 + lift}, ${cx - rx * 0.45} ${cy - ry + lift}, ${cx} ${cy - ry + lift}`,
    `C ${cx + rx * 0.55 * skew} ${cy - ry + lift}, ${cx + rx} ${cy - ry * 0.55 + lift}, ${cx + rx} ${cy + lift}`,
    `C ${cx + rx} ${cy + ry * 0.62 + lift}, ${cx + rx * 0.5} ${cy + ry + lift}, ${cx} ${cy + ry + lift}`,
    `C ${cx - rx * 0.5 * skew} ${cy + ry + lift}, ${cx - rx} ${cy + ry * 0.6 + lift}, ${cx - rx} ${cy + lift}`,
    'Z',
  ].join(' ');
}
