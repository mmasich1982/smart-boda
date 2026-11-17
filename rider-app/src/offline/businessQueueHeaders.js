// rider-app/src/offline/businessQueueHeaders.js
// MULTIPLE BUSINESSES + DATA ISOLATION: a Smart Bizna item in the sync queue is sent FOR THE BUSINESS IT WAS MADE IN (its own business_id), never for
// whichever business happens to be open when the network returns. Pure, so it is tested without the queue.
export function withBusinessHeader(item, config = {}) {
  if (!item || !String(item.endpoint || '').startsWith('/business/')) return config;
  const id = item.data && item.data.business_id ? String(item.data.business_id).trim() : '';
  if (!id) return config;                                   // not attributable to a business: sent as before; the server refuses it when the person holds several
  return { ...config, headers: { ...(config.headers || {}), 'X-Business-Id': id } };
}

export default { withBusinessHeader };
