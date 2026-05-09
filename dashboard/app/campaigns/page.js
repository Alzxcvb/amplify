'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

function formatPct(ratio) {
  if (ratio == null) return '—';
  return (ratio * 100).toFixed(1) + '%';
}

function ActiveBadge({ active }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        active !== false
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      {active !== false ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(null);

  const loadCampaigns = useCallback(() => {
    fetch('/api/campaigns')
      .then(r => r.json())
      .then(data => {
        setCampaigns(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  async function toggleActive(campaign) {
    setToggling(campaign.id);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: campaign.active === false }),
      });
      if (!res.ok) throw new Error('Failed to update campaign');
      const updated = await fetch('/api/campaigns').then(r => r.json());
      setCampaigns(updated);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setToggling(null);
    }
  }

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
    <main className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-1 text-sm text-gray-500">
            {campaigns.filter(c => c.active !== false).length} active of {campaigns.length} total
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          + New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="mt-8 text-gray-400">No campaigns yet. Create your first one.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          {campaigns.map(c => {
            const subredditCount = c.platforms?.reddit?.length ?? 0;
            const isActive = c.active !== false;
            return (
              <div
                key={c.id}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{c.product || c.id}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{c.id}</p>
                  </div>
                  <ActiveBadge active={c.active} />
                </div>

                {c.pitch && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{c.pitch}</p>
                )}

                <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                  <div className="rounded-md bg-gray-50 p-2">
                    <p className="text-lg font-bold text-gray-800">{subredditCount}</p>
                    <p className="text-xs text-gray-500">Subreddits</p>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <p className="text-lg font-bold text-gray-800">{c.replies24h ?? 0}</p>
                    <p className="text-xs text-gray-500">24h Replies</p>
                  </div>
                  <div className="rounded-md bg-gray-50 p-2">
                    <p className="text-lg font-bold text-gray-800">{formatPct(c.lastMatchRatio)}</p>
                    <p className="text-xs text-gray-500">Last Match %</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    View details →
                  </Link>
                  <button
                    onClick={() => toggleActive(c)}
                    disabled={toggling === c.id}
                    className={`text-xs rounded px-3 py-1.5 font-medium transition-colors ${
                      isActive
                        ? 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                    } disabled:opacity-50`}
                  >
                    {toggling === c.id ? '…' : isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
