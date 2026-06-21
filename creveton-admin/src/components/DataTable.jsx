import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';

/**
 * Table de données générique : colonnes configurables (def @tanstack/react-table),
 * tri par colonne, pagination cliente. `onRowClick` rend les lignes cliquables.
 *
 * @param {Array}  columns   définitions de colonnes (@tanstack/react-table).
 * @param {Array}  data
 * @param {boolean} loading
 * @param {number} pageSize
 * @param {(row)=>void} onRowClick
 */
export default function DataTable({ columns, data = [], loading, pageSize = 10, onRowClick, emptyMessage }) {
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

  if (loading) return <div className="card"><LoadingSpinner label="Chargement…" /></div>;
  if (!data.length) {
    return <div className="card"><EmptyState message={emptyMessage} /></div>;
  }

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
                    <th
                      key={header.id}
                      className={canSort ? 'sortable' : ''}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
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
              <tr
                key={row.id}
                className={onRowClick ? 'clickable' : ''}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="table-pagination">
          <span className="page-info">
            Page {pageIndex + 1} / {pageCount} · {data.length} éléments
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button className="icon-btn" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeft size={16} />
            </button>
            <button className="icon-btn" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
