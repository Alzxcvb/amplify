'use client';
import { useState, useEffect } from 'react';

function ratioPercent(row) {
  if (!row.comments_checked) return 0;
  return (row.matches_found / row.comments_checked) * 100;
}

function ratioColor(pct) {
  if (pct > 2) return 'text-green-700 font-medium';
  if (pct >= 0.5) return 'text-yellow-700 font-medium';
  return 'text-red-600 font-medium';
}

function ratioBg(pct) {
  if (pct > 2) return 'bg-green-50';
  if (pct >= 0.5) return 'bg-yellow-50';
  if (pct === 0 && !pct) return '';
  return 'bg-red-50';
}

function statusBadge(row) {
  if (row.flagged) {
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">Flagged</span>;
  }
  if (row.source === 'discovered') {
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700">Discovered</span>;
  }
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Active</span>;
}

export default function SubredditsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    fetch('/api/subreddits')
      .then(r => r.json())
      .then(data => {
        setRows(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <main className="p-8"><p className="text-gray-500">Loading…</p></main>;
  }

  if (error) {
    return <main className="p-8"><p className="text-red-600">Error: {error}</p></main>;
  }

  const sorted = [...rows].sort((a, b) => {
    const diff = ratioPercent(a) - ratioPercent(b);
    return sortDir === 'desc' ? -diff : diff;
  });

  function toggleSort() {
    setSortDir(d => d === 'desc' ? 'asc' : 'desc');
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subreddit Stats</h1>
          <p className="mt-1 text-sm text-gray-500">{rows.length} subreddits across all campaigns</p>
        </div>
        <a href="/" className="text-sm text-blue-600 hover:underline">← Back to Dashboard</a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Campaign</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Subreddit</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Scans</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Posts</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Comments</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Matches</th>
              <th
                className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                onClick={toggleSort}
              >
                Ratio {sortDir === 'desc' ? '↓' : '↑'}
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  No subreddit data yet. Run the bot first.
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => {
                const pct = ratioPercent(row);
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.campaign_id}</td>
                    <td className="px-4 py-3 font-medium text-blue-700 whitespace-nowrap">
                      <a
                        href={`https://www.reddit.com/${row.subreddit}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {row.subreddit}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.scans ?? 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.posts_found ?? 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.comments_checked ?? 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{row.matches_found ?? 0}</td>
                    <td className={`px-4 py-3 text-right ${ratioColor(pct)}`}>
                      {row.comments_checked ? `${pct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(row)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        Ratio = matches / comments checked. Color: <span className="text-green-700">&gt;2% green</span>, <span className="text-yellow-700">0.5–2% yellow</span>, <span className="text-red-600">&lt;0.5% red</span>. Click "Ratio" header to toggle sort.
      </div>
    </main>
  );
}
