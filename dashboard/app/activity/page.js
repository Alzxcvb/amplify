'use client';
import { useState, useEffect } from 'react';

const PAGE_SIZE = 50;

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function formatTs(unixSec) {
  if (!unixSec) return '—';
  return new Date(unixSec * 1000).toLocaleString();
}

export default function ActivityPage() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch('/api/activity')
      .then(r => r.json())
      .then(data => {
        setActivity(data);
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

  const totalPages = Math.ceil(activity.length / PAGE_SIZE);
  const pageItems = activity.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
          <p className="mt-1 text-sm text-gray-500">{activity.length} total entries</p>
        </div>
        <a
          href="/"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to Dashboard
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Time</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Campaign</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Post URL</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Reply / Reason</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No activity yet.
                </td>
              </tr>
            ) : (
              pageItems.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatTs(row.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                    {row.campaign_id}
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
                        {truncate(row.post_url, 60)}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-sm">
                    {truncate(row.reply_text || row.reason, 100)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.type === 'reply'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {row.type}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages} ({PAGE_SIZE * page + 1}–{Math.min(PAGE_SIZE * (page + 1), activity.length)} of {activity.length})
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
