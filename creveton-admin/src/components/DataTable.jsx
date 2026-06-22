import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { SkeletonTable } from './Skeleton';
import EmptyState from './EmptyState';

/** Fenêtre de numéros de page autour de la page courante. */
function pageWindow(current, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const pages = new Set([0, count - 1, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 0 && p < count).sort((a, b) => a - b);
  const out = [];
  let prev = -1;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Table générique : colonnes configurables, tri, pagination cliente (numéros).
 */
export default function DataTable({ columns, data = [], loading, pageSize = 20, onRowClick, emptyMessage, pageFooter }) {
  const [sorting, setSorting] = useState([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  if (loading) return <SkeletonTable rows={8} cols={columns.length || 5} />;
  if (!data.length) return <div className="card"><EmptyState message={emptyMessage} /></div>;

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="card">
      <div className="table-wrap">
        <table className="data">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <th key={header.id} className={canSort ? 'sortable' : ''} onClick={canSort ? header.column.getToggleSortingHandler() : undefined}>
                      <span className="row" style={{ gap: 4 }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {dir === 'asc' && <ChevronUp size={13} />}
                        {dir === 'desc' && <ChevronDown size={13} />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(row.original) : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {pageFooter && (
            <tfoot>
              {pageFooter(table.getRowModel().rows.map((r) => r.original))}
            </tfoot>
          )}
        </table>
      </div>

      {pageCount > 1 && (
        <div className="table-pagination">
          <span className="page-info">{data.length} éléments · {pageSize} par page</span>
          <div className="row" style={{ gap: 5 }}>
            <button className="icon-btn" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} aria-label="Précédent"><ChevronLeft size={16} /></button>
            {pageWindow(pageIndex, pageCount).map((p, i) =>
              p === '…' ? (
                <span key={`e${i}`} className="muted" style={{ padding: '0 4px' }}>…</span>
              ) : (
                <button
                  key={p}
                  className={`btn btn-sm ${p === pageIndex ? 'btn-primary' : ''}`}
                  style={{ minWidth: 34, justifyContent: 'center' }}
                  onClick={() => table.setPageIndex(p)}
                >
                  {p + 1}
                </button>
              ),
            )}
            <button className="icon-btn" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} aria-label="Suivant"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
