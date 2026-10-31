// admin-console/src/components/Pagination.jsx
// Shared pagination bar: "Showing 21-40 of 133", Prev / Next, "Page X of Y" and a page-size picker.
// Used by Individual Riders, Manage Groups and Members, and Incoming Group Member Additions.
//
// Props:
//   page, pageSize, total   current 1-based page, rows per page, total rows across all pages
//   onPage(n)               called with the new 1-based page number
//   onPageSize(n)           called with the new page size (optional -- hides the picker if omitted)
//   pageSizes               choices for the picker (default 10 / 20 / 50 / 100)
//   disabled                disables the controls while a page is loading
import React from 'react';

export default function Pagination({ page, pageSize, total, onPage, onPageSize, pageSizes = [10, 20, 50, 100], disabled = false }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total || 0);

  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 13 }}>
        {total ? `Showing ${from}–${to} of ${total}` : 'No results'}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
        {onPageSize && (
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
            Rows per page
            <select value={pageSize} disabled={disabled} onChange={(e) => onPageSize(Number(e.target.value))} style={{ padding: 4 }}>
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <button className="secondary" disabled={disabled || page <= 1} onClick={() => onPage(1)} aria-label="First page">«</button>
        <button className="secondary" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
        <span style={{ fontSize: 13 }}>Page {page} of {totalPages}</span>
        <button className="secondary" disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
        <button className="secondary" disabled={disabled || page >= totalPages} onClick={() => onPage(totalPages)} aria-label="Last page">»</button>
      </div>
    </div>
  );
}
