// rider-app/src/hooks/useLegalDocuments.js
// Issue 15 fix: Fetch Terms of Service and Data Privacy documents from backend
// Caches documents locally to support offline access

import { useEffect, useState } from 'react';
import api from '../api/client';
import { getLocalLegalDocuments, saveLocalLegalDocuments } from '../offline/db';

export function useLegalDocuments() {
  const [documents, setDocuments] = useState({
    termsOfService: null,
    dataPrivacy: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        setLoading(true);
        
        // Try to fetch from backend first
        try {
          const termsRes = await api.get('/legal/terms-of-service');
          const privacyRes = await api.get('/legal/data-privacy-notice');
          
          const docs = {
            termsOfService: termsRes.data?.content || '',
            dataPrivacy: privacyRes.data?.content || '',
          };

          if (isMounted) {
            setDocuments(docs);
            // Cache locally for offline access
            await saveLocalLegalDocuments(docs);
            setError(null);
          }
        } catch (apiError) {
          // If backend fails, try to load from local cache
          console.warn('Failed to fetch legal documents from backend, checking cache:', apiError.message);
          const cached = await getLocalLegalDocuments();
          
          if (cached && (cached.termsOfService || cached.dataPrivacy)) {
            if (isMounted) {
              setDocuments(cached);
              setError(null);
            }
          } else {
            // No cache and backend failed
            throw apiError;
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Failed to load legal documents');
          // Set placeholder documents
          setDocuments({
            termsOfService: 'Terms of Service could not be loaded. Please check your connection or contact support.',
            dataPrivacy: 'Data Privacy Notice could not be loaded. Please check your connection or contact support.',
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    documents,
    loading,
    error,
  };
}