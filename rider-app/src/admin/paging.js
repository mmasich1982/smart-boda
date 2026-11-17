// rider-app/src/admin/paging.js
// ADMIN APP: every admin list is paged (BR-SB06-008 style, same PaginationControls as the rest of the app).
// Server-paged lists send page + page_size and read total. The few lists the server returns whole (slot requests, business types,
// statement requests: the console pages them in the browser too) are cut here.
export const PAGE_SIZE = 10;

export const totalPagesOf = (total, pageSize = PAGE_SIZE) => Math.max(1, Math.ceil((Number(total) || 0) / pageSize));

/** The page to show after the list got shorter (a row removed or decided elsewhere): never beyond the last page, never below 1. */
export const clampPage = (page, total, pageSize = PAGE_SIZE) => Math.min(Math.max(1, page || 1), totalPagesOf(total, pageSize));

export function pageSlice(items, page, pageSize = PAGE_SIZE) {
  const all = Array.isArray(items) ? items : [];
  const p = clampPage(page, all.length, pageSize);
  return { page: p, total: all.length, totalPages: totalPagesOf(all.length, pageSize), items: all.slice((p - 1) * pageSize, p * pageSize) };
}

/** The page to go to after removing one row: the previous page when the removed row was the only one on the last page. */
export const pageAfterRemoval = (page, rowsOnPage) => (rowsOnPage <= 1 && page > 1 ? page - 1 : page);
