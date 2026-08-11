export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="LensLayer">
      <span className="brand-mark" aria-hidden="true"><i /><i /><b /></span>
      {!compact && <span className="brand-name">LensLayer</span>}
    </span>
  );
}
