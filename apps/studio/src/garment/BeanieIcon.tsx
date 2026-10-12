/** A beanie, drawn for each style so the choice reads at a glance: a cuffed hat with a colour body, or one in rib all over. */
export function BeanieIcon({ style }: { style: 'cuffed' | 'rib' }) {
  const ribs = (top: number, bottom: number) => Array.from({ length: 9 }, (_, index) => `M${16 + index * 4} ${top} V${bottom}`).join(' ');
  return <svg className="silhouette-icon" viewBox="0 0 64 60" width="64" height="60" aria-hidden="true">
    <path d={style === 'cuffed' ? 'M13 42 V26 Q13 8 32 8 Q51 8 51 26 V42 Z' : 'M13 54 V26 Q13 8 32 8 Q51 8 51 26 V54 Z'} fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    {/* The crown is gathered at the top. */}
    <path d="M27 10 L32 15 L37 10 M32 8 V15" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    {style === 'cuffed'
      ? <>
          <path d="M16 31 L20 27 L24 31 L28 27 L32 31 L36 27 L40 31 L44 27 L48 31" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <rect x="11" y="42" width="42" height="12" rx="2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.6" />
          <path d={ribs(44, 52)} stroke="currentColor" strokeWidth="1" opacity="0.6" />
        </>
      : <path d={ribs(20, 52)} stroke="currentColor" strokeWidth="1" opacity="0.6" />}
  </svg>;
}
