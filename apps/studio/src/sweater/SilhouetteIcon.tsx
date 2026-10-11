import type { SweaterObject } from '@kniterate-studio/project-contract';

/** A sweater front, drawn for each style so the choice reads at a glance. */
export function SilhouetteIcon({ silhouette, neckline }: { silhouette: SweaterObject['silhouette']; neckline: SweaterObject['neckline'] }) {
  const neck = neckline === 'crew' ? 'M25 8 Q32 15 39 8' : 'M23 7 Q32 9 41 7';
  const body = {
    // Shoulder seam out on the arm; sleeves hang straight from it.
    'drop-shoulder': 'M10 8 H54 L62 38 L55 40 L49 22 V58 H15 V22 L9 40 L2 38 Z',
    // A drop shoulder with a short step in at the underarm.
    'j-sleeve': 'M11 8 H53 L61 38 L54 40 L49 24 L47 26 V58 H17 V26 L15 24 L10 40 L3 38 Z',
    // Shoulders at the shoulder point; the sleeve is set into a curved armhole.
    'set-in': 'M18 8 H46 Q50 10 51 15 L60 40 L53 42 L46 26 V58 H18 V26 L11 42 L4 40 L13 15 Q14 10 18 8 Z',
  }[silhouette];
  const seams = {
    'drop-shoulder': 'M15 8 V22 M49 8 V22',
    'j-sleeve': 'M17 8 V26 M47 8 V26',
    'set-in': 'M18 8 Q16 18 18 26 M46 8 Q48 18 46 26',
  }[silhouette];
  return <svg className="silhouette-icon" viewBox="0 0 64 60" width="64" height="60" aria-hidden="true">
    <path d={body} fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d={seams} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" />
    <path d={neck} fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M15 54 H49" stroke="currentColor" strokeWidth="1" opacity="0.6" />
  </svg>;
}
