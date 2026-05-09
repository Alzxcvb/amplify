'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function matchRatioColor(ratio) {
  if (ratio == null || isNaN(ratio)) return 'text-gray-400';
  if (ratio > 0.02) return 'text-green-600';
  if (ratio > 0.005) return 'text-yellow-600';
  return 'text-red-500';
}

function sourceLabel(source, isAutoTuned) {
  if (source === 'auto-tuned' || isAutoTuned) return { label: 'auto-tuned', cls: 'bg-purple-50 text-purple-700' };
  if (source === 'manual') return { label: 'manual', cls: 'bg-blue-50 text-blue-700' };
  return { label: 'default', cls: 'bg-gray-100 text-gray-500' };
}

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id;
  const router = useRouter();

  const [campaign, setCampaign] = useState(null);
  const [settingsData, setSettingsData] = useState(null);
  const [subreddits, setSubreddits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Campaign info edit state
  const [infoProduct, setInfoProduct] = useState('');
  const [infoPitch, setInfoPitch] = useState('');
  const [infoPainPoints, setInfoPainPoints] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMsg, setInfoMsg] = useState(null);

  // Settings edit state per key
  const [editValues, setEditValues] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [settingsMsg, setSettingsMsg] = useState({});

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/campaigns/${id}`).then(r => r.json()),
      fetch(`/api/campaigns/${id}/settings`).then(r => r.json()),
      fetch(`/api/subreddits?campaign=${id}`).then(r => r.json()),
    ])
      .then(([camp, sett, subs]) => {
        if (camp.error) throw new Error(camp.error);
        setCampaign(camp);
        setSettingsData(sett);
        setSubreddits(subs);
        setInfoProduct(camp.product ?? '');
        setInfoPitch(camp.pitch ?? '');
        setInfoPainPoints((camp.pain_points ?? []).join(', '));
        // Pre-populate edit values with current effective values
        const vals = {};
        for (const key of Object.keys(sett.defaults ?? {})) {
          const row = sett.settings?.[key];
          vals[key] = row ? row.setting_value : String(sett.defaults[key]);
        }
        setEditValues(vals);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  async function saveInfo() {
    setSavingInfo(true);
    setInfoMsg(null);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: infoProduct,
          pitch: infoPitch,
          pain_points: infoPainPoints.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setCampaign(prev => ({ ...prev, ...data.campaign }));
      setInfoMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      setInfoMsg({ ok: false, text: err.message });
    }
    setSavingInfo(false);
  }

  async function saveSetting(key) {
    setSavingKey(key);
    setSettingsMsg(prev => ({ ...prev, [key]: null }));
    try {
      const res = await fetch(`/api/campaigns/${id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: editValues[key] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      // Refresh settings
      const fresh = await fetch(`/api/campaigns/${id}/settings`).then(r => r.json());
      setSettingsData(fresh);
      setSettingsMsg(prev => ({ ...prev, [key]: { ok: true, text: 'Saved.' } }));
    } catch (err) {
      setSettingsMsg(prev => ({ ...prev, [key]: { ok: false, text: err.message } }));
    }
    setSavingKey(null);
  }

  async function resetSetting(key) {
    setSavingKey(key);
    setSettingsMsg(prev => ({ ...prev, [key]: null }));
    try {
      const res = await fetch(`/api/campaigns/${id}/settings`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      const fresh = await fetch(`/api/campaigns/${id}/settings`).then(r => r.json());
      setSettingsData(fresh);
      const defaultVal = fresh.defaults?.[key];
      setEditValues(prev => ({ ...prev, [key]: String(defaultVal ?? '') }));
      setSettingsMsg(prev => ({ ...prev, [key]: { ok: true, text: 'Reset to default.' } }));
    } catch (err) {
      setSettingsMsg(prev => ({ ...prev, [key]: { ok: false, text: err.message } }));
    }
    setSavingKey(null);
  }

  // Flatten tuning history sorted by date
  function getTuningLog() {
    if (!settingsData?.tuningHistoryByKey) return [];
    const all = [];
    for (const rows of Object.values(settingsData.tuningHistoryByKey)) {
      all.push(...rows);
    }
    return all.sort((a, b) => (b.changed_at ?? 0) - (a.changed_at ?? 0)).slice(0, 30);
  }

  if (loading) {
    return <main className="p-8"><p className="text-gray-500">Loading…</p></main>;
  }

  if (error) {
    return (
      <main className="p-8">
        <p className="text-red-600">Error: {error}</p>
        <a href="/campaigns" className="mt-4 inline-block text-sm text-blue-600 hover:underline">← Campaigns</a>
      </main>
    );
  }

  const defaults = settingsData?.defaults ?? {};
  const settings = settingsData?.settings ?? {};
  const tuningLog = getTuningLog();

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{campaign.product ?? id}</h1>
          <p className="mt-0.5 text-sm text-gray-400 font-mono">{id}</p>
        </div>
        <a href="/campaigns" className="text-sm text-blue-600 hover:underline">← Campaigns</a>
      </div>

      {/* Section 1: Campaign Info */}
      <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Campaign Info</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
          <input
            type="text"
            value={infoProduct}
            onChange={e => setInfoProduct(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pitch</label>
          <textarea
            value={infoPitch}
            onChange={e => setInfoPitch(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pain Points</label>
          <input
            type="text"
            value={infoPainPoints}
            onChange={e => setInfoPainPoints(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">Comma-separated keywords.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveInfo}
            disabled={savingInfo}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40"
          >
            {savingInfo ? 'Saving…' : 'Save Changes'}
          </button>
          {infoMsg && (
            <span className={`text-sm ${infoMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
              {infoMsg.text}
            </span>
          )}
        </div>
      </section>

      {/* Section 2: Adaptive Settings */}
      <section className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Adaptive Settings</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Auto-tuner adjusts these to maximize match ratio. Manual edits override auto-tuning.
          </p>
        </div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Parameter</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Current Value</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Source</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Last Tuned</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Reason</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {Object.entries(defaults).map(([key, defaultVal]) => {
              const row = settings[key];
              const effectiveVal = row ? row.setting_value : String(defaultVal);
              const src = row
                ? (row.is_auto_tuned ? 'auto-tuned' : 'manual')
                : 'default';
              const badge = sourceLabel(src, false);
              const isSaving = savingKey === key;
              const msg = settingsMsg[key];
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{key}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={editValues[key] ?? effectiveVal}
                      onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-28 border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                    {row?.tuned_at ? formatDate(row.tuned_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">
                    {row?.tune_reason ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveSetting(key)}
                        disabled={isSaving}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-40"
                      >
                        {isSaving ? '…' : 'Save'}
                      </button>
                      {row && (
                        <button
                          onClick={() => resetSetting(key)}
                          disabled={isSaving}
                          className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                        >
                          Reset
                        </button>
                      )}
                      {msg && (
                        <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>
                          {msg.text}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Section 3: Subreddits */}
      <section className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Subreddits</h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Campaign subreddits and auto-discovered ones. Flagged subreddits are skipped.
          </p>
        </div>
        {subreddits.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No subreddits found. Run the bot to populate stats.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Subreddit</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Source</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Scans</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Posts</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Comments</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Matches</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Ratio</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subreddits.map(sub => {
                const ratio = sub.comments_checked > 0
                  ? sub.matches_found / sub.comments_checked
                  : null;
                return (
                  <tr key={sub.subreddit} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <a
                        href={`https://www.reddit.com/${sub.subreddit}/new`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 hover:underline"
                      >
                        {sub.subreddit}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        sub.source === 'discovered'
                          ? 'bg-purple-50 text-purple-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {sub.source ?? 'campaign'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{sub.scans ?? 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{sub.posts_found ?? 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{sub.comments_checked ?? 0}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{sub.matches_found ?? 0}</td>
                    <td className={`px-4 py-3 text-right font-medium ${matchRatioColor(ratio)}`}>
                      {ratio != null ? (ratio * 100).toFixed(1) + '%' : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {sub.flagged ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-600">
                          Flagged
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-50 text-green-600">
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Section 4: Tuning History */}
      <section className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Tuning History</h2>
        </div>
        {tuningLog.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No tuning history yet. Tuning begins after 2+ runs.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">When</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Parameter</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Change</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Match Ratio</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Sample</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tuningLog.map((entry, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                    {formatDate(entry.changed_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">
                    {entry.setting_key}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    <span className="text-gray-400">{entry.old_value ?? '—'}</span>
                    {' → '}
                    <span className="font-medium">{entry.new_value}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {entry.match_ratio != null
                      ? (entry.match_ratio * 100).toFixed(1) + '%'
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {entry.comments_checked ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">
                    {entry.reason ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
