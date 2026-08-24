import api from './client';

export async function listLanguages() {
  const { data } = await api.get('/admin/master-data/languages');
  return data;
}

export async function createLanguage(code, displayName) {
  // ✅ backend expects display_name, not name
  const { data } = await api.post('/admin/master-data/languages', {
    code,
    display_name: displayName,
  });
  return data;
}

// NOTE: MasterDataDropdowns.jsx calls this as updateLanguage(l.id, patch) -- keyed by the
// language row's id, not its code -- matches the PATCH route below.
export async function updateLanguage(id, patch) {
  const { data } = await api.patch(`/admin/master-data/languages/${id}`, patch);
  return data;
}

export async function listFuelTypes() {
  const { data } = await api.get('/admin/master-data/fuel-types');
  return data;
}

export async function createFuelType(code, displayName) {
  // ✅ backend expects display_name, not name
  const { data } = await api.post('/admin/master-data/fuel-types', {
    code,
    display_name: displayName,
  });
  return data;
}

export async function listUiStrings(languageCode) {
  const { data } = await api.get(`/admin/master-data/ui-strings/${languageCode}`);
  return data;
}

export async function updateUiString(id, patch) {
  const { data } = await api.patch(`/admin/master-data/ui-strings/${id}`, patch);
  return data;
}

export async function getLegalContent() {
  const { data } = await api.get('/admin/master-data/legal-content');
  return data;
}

export async function updateLegalContent(key, content) {
  const { data } = await api.put(`/admin/master-data/legal-content/${key}`, { content });
  return data;
}

// Alias functions for LegalDocumentsPage compatibility
export async function listLegalDocuments() {
  return await getLegalContent();
}

export async function updateLegalDocument(key, patch) {
  return await updateLegalContent(key, patch.content);
}

export async function listValuePreviewConfigs() {
  const { data } = await api.get('/admin/master-data/value-preview-configs');
  return data;
}

export async function updateValuePreviewConfig(languageCode, patch) {
  const { data } = await api.patch(`/admin/master-data/value-preview-configs/${languageCode}`, patch);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE DOCUMENT TYPES (License, Insurance, etc.)
// ═══════════════════════════════════════════════════════════════════════════

export async function listDocumentTypes() {
  const { data } = await api.get('/admin/master-data/document-types');
  return data;
}

export async function createDocumentType(code, name, description, requiresExpiry) {
  const { data } = await api.post('/admin/master-data/document-types', {
    code,
    name,
    description,
    requires_expiry: requiresExpiry,
  });
  return data;
}

export async function updateDocumentType(id, patch) {
  const { data } = await api.patch(`/admin/master-data/document-types/${id}`, patch);
  return data;
}

export async function deleteDocumentType(id) {
  const { data } = await api.delete(`/admin/master-data/document-types/${id}`);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVINGS TYPES (SACCO, Chama, etc.)
// ═══════════════════════════════════════════════════════════════════════════

export async function listSavingsTypes() {
  const { data } = await api.get('/admin/master-data/savings-types');
  return data;
}

export async function createSavingsType(code, name, description) {
  const { data } = await api.post('/admin/master-data/savings-types', {
    code,
    name,
    description,
  });
  return data;
}

export async function updateSavingsType(id, patch) {
  const { data } = await api.patch(`/admin/master-data/savings-types/${id}`, patch);
  return data;
}

export async function deleteSavingsType(id) {
  const { data } = await api.delete(`/admin/master-data/savings-types/${id}`);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVINGS FREQUENCIES (Daily, Weekly, Monthly, etc.)
// ═══════════════════════════════════════════════════════════════════════════

export async function listSavingsFrequencies() {
  const { data } = await api.get('/admin/master-data/savings-frequencies');
  return data;
}

export async function createSavingsFrequency(code, name, description) {
  const { data } = await api.post('/admin/master-data/savings-frequencies', {
    code,
    name,
    description,
  });
  return data;
}

export async function updateSavingsFrequency(id, patch) {
  const { data } = await api.patch(`/admin/master-data/savings-frequencies/${id}`, patch);
  return data;
}

export async function deleteSavingsFrequency(id) {
  const { data } = await api.delete(`/admin/master-data/savings-frequencies/${id}`);
  return data;
}