"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function QueryPagination({ total, offset, limit, onOffsetChange, label = "Results", disabled = false }: {
  total: number; offset: number; limit: number; onOffsetChange: (offset: number) => void; label?: string; disabled?: boolean;
}) {
  return <div className="table-pagination"><p>Showing {total && offset < total ? offset + 1 : 0} to {offset < total ? Math.min(offset + limit, total) : 0} of {total} entries</p><nav aria-label={`${label} pages`}><button type="button" disabled={disabled || offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - limit))}><ChevronLeft size={16} />Previous</button><button type="button" disabled={disabled || offset + limit >= total} onClick={() => onOffsetChange(offset + limit)}>Next<ChevronRight size={16} /></button></nav></div>;
}
