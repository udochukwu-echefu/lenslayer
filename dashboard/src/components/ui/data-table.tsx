"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";

function paginationPages(pageCount: number, current: number) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index);
  const pages = [...new Set([0, current - 1, current, current + 1, pageCount - 1].filter((page) => page >= 0 && page < pageCount))].sort((a, b) => a - b);
  return pages.flatMap((page, index) => index > 0 && page - pages[index - 1] > 1 ? [-1, page] : [page]);
}

export type DataColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  mobileLabel?: string;
  sortValue?: (row: T) => string | number;
  numeric?: boolean;
  primary?: boolean;
  className?: string;
};

export function DataTable<T>({
  ariaLabel,
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  pageSize = 10,
  showFooter = false,
}: {
  ariaLabel: string;
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty: ReactNode;
  pageSize?: number;
  showFooter?: boolean;
}) {
  const [sort, setSort] = useState<{ id: string; direction: "ascending" | "descending" } | null>(null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.id === sort.id);
    if (!column?.sortValue) return rows;
    return [...rows].sort((left, right) => {
      const a = column.sortValue!(left);
      const b = column.sortValue!(right);
      const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true });
      return sort.direction === "ascending" ? order : -order;
    });
  }, [columns, rows, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const pageLinks = paginationPages(pageCount, safePage);
  const firstVisible = safePage * pageSize + 1;
  const lastVisible = Math.min((safePage + 1) * pageSize, sorted.length);

  function toggleSort(column: DataColumn<T>) {
    if (!column.sortValue) return;
    setSort((current) => current?.id === column.id && current.direction === "ascending"
      ? { id: column.id, direction: "descending" }
      : { id: column.id, direction: "ascending" });
    setPage(0);
  }

  if (!rows.length) return <>{empty}</>;
  return <div className="data-table-region">
    <div className="data-table-scroll">
      <table className="data-table">
        <caption className="sr-only">{ariaLabel}</caption>
        <thead><tr>{columns.map((column) => <th key={column.id} scope="col" className={`${column.numeric ? "numeric" : ""} ${column.className ?? ""}`.trim()} aria-sort={sort?.id === column.id ? sort.direction : column.sortValue ? "none" : undefined}>
          {column.sortValue ? <button type="button" onClick={() => toggleSort(column)}>{column.header}{sort?.id === column.id ? sort.direction === "ascending" ? <ArrowUp size={14} /> : <ArrowDown size={14} /> : <ArrowUpDown size={14} />}</button> : column.header}
        </th>)}</tr></thead>
        <tbody>{visible.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.id} className={`${column.numeric ? "numeric" : ""} ${column.className ?? ""}`.trim()}>{column.primary && rowHref ? <Link className="table-primary-link" href={rowHref(row)}>{column.cell(row)}</Link> : column.cell(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="data-mobile-list" aria-label={ariaLabel}>{visible.map((row) => <article key={rowKey(row)}>{columns.map((column) => <div key={column.id} className={column.primary ? "mobile-primary" : ""}>{!column.primary && <span>{column.mobileLabel ?? column.header}</span>}{column.primary && rowHref ? <Link href={rowHref(row)}>{column.cell(row)}</Link> : column.cell(row)}</div>)}</article>)}</div>
    {showFooter && <div className="table-pagination"><p>Showing {firstVisible} to {lastVisible} of {sorted.length} entries</p>{pageCount > 1 && <nav aria-label={`${ariaLabel} pages`}><button type="button" onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}><ChevronLeft size={16} />Previous</button>{pageLinks.map((page, index) => page === -1 ? <span className="table-page-gap" key={`gap-${index}`}>...</span> : <button type="button" className="table-page-number" aria-current={safePage === page ? "page" : undefined} onClick={() => setPage(page)} key={page}>{page + 1}</button>)}<button type="button" onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))} disabled={safePage === pageCount - 1}>Next<ChevronRight size={16} /></button></nav>}</div>}
  </div>;
}
