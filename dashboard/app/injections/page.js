'use client';
import { useState, useEffect } from 'react';

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function formatTs(unixSec) {
  if (!unixSec) return '—';
  return new Date(unixSec * 1000).toLocaleString();
}

function sanitize(str) {
  if (!str) return '—';
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function InjectionsPage() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/injections')
      .then(r => r.json())
      .then(data => {
        setAttempts(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <main className="p-8">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-8">
        <p className="text-red-600">Error: {error}</p>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Injection Attempts</h1>
          <p className="mt-1 text-sm text-gray-500">{attempts.length} total detected</p>
        </div>
        <a href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to Dashboard
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Time</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Campaign</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Pattern</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Comment Preview</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Post URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {attempts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No injection attempts detected yet.
                </td>
              </tr>
            ) : (
              attempts.map((row, i) => (
                <tr key={i} className="hover:bg-red-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatTs(row.detected_at)}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                    {row.campaign_id}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 font-mono">
                      {row.pattern_matched}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-sm font-mono text-xs">
                    <span
                      title={row.comment_preview}
                      dangerouslySetInnerHTML={{ __html: sanitize(truncate(row.comment_preview, 100)) }}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs">
                    {row.post_url ? (
                      <a
                        href={row.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                        title={row.post_url}
                      >
                        {truncate(row.post_url, 50)}
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
