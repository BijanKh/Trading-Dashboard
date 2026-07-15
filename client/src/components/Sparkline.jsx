import React, { useId } from 'react';
import { colors } from '../styles/theme';

// Tiny inline SVG sparkline for tiles/panels. data: [{ date, value }].
// baseline: draw a dashed reference line at this value when it falls inside
// the data range (e.g. 0 for an oscillator).
// posColor/negColor (with baseline set): two-tone regime mode — the line and
// a light area fill render in posColor above the baseline and negColor below,
// split exactly at the crossing via SVG clip rects.
export default function Sparkline({
  data, width = 84, height = 22, color = colors.text.accent,
  baseline = null, posColor = null, negColor = null,
}) {
  const uid = useId();
  const values = (data || []).map(d => d.value).filter(v => v != null && isFinite(v));
  if (values.length < 3) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const y = (v) => height - 2 - ((v - min) / span) * (height - 4);
  const x = (i) => (i / (values.length - 1)) * (width - 2) + 1;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);

  const split = baseline != null && posColor != null && negColor != null;
  const showBaseline = baseline != null && baseline >= min && baseline <= max;
  const yb = baseline != null ? Math.min(Math.max(y(baseline), 0), height) : null;

  if (!split) {
    return (
      <svg width={width} height={height} style={{ display: 'block', opacity: 0.85 }}>
        {showBaseline && (
          <line
            x1={1} x2={width - 1} y1={yb} y2={yb}
            stroke={colors.text.muted} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"
          />
        )}
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  const area = `1,${yb.toFixed(1)} ${pts.join(' ')} ${(width - 1).toFixed(1)},${yb.toFixed(1)}`;
  return (
    <svg width={width} height={height} style={{ display: 'block', opacity: 0.85 }}>
      <defs>
        <clipPath id={`${uid}-pos`}><rect x="0" y="0" width={width} height={yb} /></clipPath>
        <clipPath id={`${uid}-neg`}><rect x="0" y={yb} width={width} height={Math.max(height - yb, 0)} /></clipPath>
      </defs>
      {showBaseline && (
        <line
          x1={1} x2={width - 1} y1={yb} y2={yb}
          stroke={colors.text.muted} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"
        />
      )}
      <polygon points={area} fill={posColor} opacity="0.14" clipPath={`url(#${uid}-pos)`} />
      <polygon points={area} fill={negColor} opacity="0.14" clipPath={`url(#${uid}-neg)`} />
      <polyline points={pts.join(' ')} fill="none" stroke={posColor} strokeWidth="1.5" strokeLinejoin="round" clipPath={`url(#${uid}-pos)`} />
      <polyline points={pts.join(' ')} fill="none" stroke={negColor} strokeWidth="1.5" strokeLinejoin="round" clipPath={`url(#${uid}-neg)`} />
    </svg>
  );
}
