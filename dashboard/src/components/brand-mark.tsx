export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="Lenslayer">
      <span className="brand-mark" aria-hidden="true">LL</span>
      {!compact && <span className="brand-name">Lenslayer</span>}
    </span>
  );
}
