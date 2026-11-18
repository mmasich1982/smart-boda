// rider-app/src/utils/businessLists.js
// SMART BIZNA fixed lists and the small paging helper, pure so they are tested without the app.

/** Expense type drop list (request 4). "Others" is saved as "Others". */
export const EXPENSE_TYPES = ['Household', 'Electricity', 'Water', 'City Council', 'Hospital', 'Rent', 'Security', 'Transport', 'Airtime/Data', 'Salaries', 'Others'];

/** Purpose of a statement (request 9). */
export const STATEMENT_PURPOSES = ['Loan', 'Personal', 'Sacco', 'Other'];

export const PAGE_SIZE = 20;

/** Cut a list into pages. page is 1-based and is kept inside the real range. */
export function paginate(list, page = 1, size = PAGE_SIZE) {
  const rows = Array.isArray(list) ? list : [];
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page | 0 || 1), pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages, total: rows.length, from: rows.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, rows.length) };
}

export default { EXPENSE_TYPES, STATEMENT_PURPOSES, PAGE_SIZE, paginate };
