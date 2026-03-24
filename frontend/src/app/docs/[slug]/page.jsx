'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '../../../components/layout/AppLayout';
import DocumentViewer from '../../../components/editor/DocumentViewer';
import { api } from '../../../lib/api';
import { Loader2 } from 'lucide-react';

export default function DocPage() {
  const { slug } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    api.get(`/documents/${slug}`)
      .then(r => setDoc(r.data))
      .catch(() => setError('Document not found.'))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <AppLayout>
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={24} className="animate-spin text-blue-400" />
        </div>
      ) : error ? (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-400">{error}</div>
      ) : (
        <DocumentViewer doc={doc} userRole="admin" />
      )}
    </AppLayout>
  );
}
