'use client';
import { useState, useEffect } from 'react';

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function truncate(str, max) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function formatTs(unixSec) {
  if (!unixSec) return '—';
  return new Date(unixSec * 1000).toLocaleString();
}

export default function Home() {
  const [stats, setStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/stats').then(r => r.json()),
      fetch('/api/campaigns').then(r => r.json()),
      fetch('/api/activity').then(r => r.json()),
    ])
      .then(([s, c, a]) => {
        setStats(s);
        setCampaigns(c);
        setActivity(a.slice(0, 10));
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

  const activeCampaigns = campaigns.filter(c => c.active !== false);

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">Amplify Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mt-6">
        <StatCard label="Total Replies" value={stats?.totalReplies ?? 0} />
        <StatCard label="Last 24h Replies" value={stats?.last24hReplies ?? 0} />
        <StatCard label="Active Campaigns" value={activeCampaigns.length} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-800">Campaigns</h2>
        <p className="mt-1 text-sm text-gray-500">
          Toggle a campaign by setting <code className="bg-gray-100 px-1 rounded">"active": false</code> in its JSON file.
        </p>
        <ul className="mt-4 space-y-2">
          {campaigns.map(c => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <div>
                <span className="font-medium text-gray-900">{c.id}</span>
                {c.product && (
                  <span className="ml-2 text-sm text-gray-500">{c.product}</span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  {stats?.repliesByCampaign?.[c.id] ?? 0} replies
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    c.active !== false
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {c.active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-800">Recent Activity</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Campaign</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Post</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Reply / Reason</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activity.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No activity yet.
                  </td>
                </tr>
              ) : (
                activity.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatTs(row.timestamp)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {row.campaign_id}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs">
                      <a
                        href={row.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                        title={row.post_url}
                      >
                        {truncate(row.post_url, 50)}
                      </a>
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
      </section>
    </main>
  );
}
