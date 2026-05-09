'use client';
import { useState, useEffect } from 'react';

function formatDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function formatPct(ratio) {
  if (ratio == null) return '—';
  return (ratio * 100).toFixed(1) + '%';
}

function tuningLabel(change) {
  if (!change) return '';
  switch (change.type) {
    case 'applied':
      return `${change.parameter}: ${change.oldValue} → ${change.newValue} (applied)`;
    case 'reverted':
      return `${change.parameter}: reverted to ${change.newValue}`;
    case 'proposed':
      return `${change.parameter}: testing ${change.candidateValue}`;
    case 'subreddit_flagged':
      return `flagged: ${change.subreddit}`;
    default:
      return change.type || '?';
  }
}

export default function RunsPage() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch('/api/runs')
      .then(r => r.json())
      .then(data => {
        setRuns(data);
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
          <h1 className="text-2xl font-bold text-gray-900">Run History</h1>
          <p className="mt-1 text-sm text-gray-500">{runs.length} runs recorded</p>
        </div>
        <a href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to Dashboard
        </a>
      </div>

      {runs.length === 0 ? (
        <p className="mt-8 text-gray-400">No runs recorded yet. Run the bot to see history here.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Started</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 whitespace-nowrap">Duration</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Posts</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Comments</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Matches</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Replies</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Tuning</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run, i) => {
                const tuningCount = run.campaigns?.reduce(
                  (a, c) => a + (c.tuningChanges?.length ?? 0),
                  0
                ) ?? 0;
                const isExpanded = expanded === i;
                return (
                  <>
                    <tr
                      key={run.startedAt}
                      onClick={() => setExpanded(isExpanded ? null : i)}
                      className="cursor-pointer hover:bg-gray-50 select-none"
                    >
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {formatDate(run.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDuration(run.finishedAt - run.startedAt)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{run.totalPostsScanned ?? 0}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{run.totalCommentsChecked ?? 0}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{run.totalMatchesFound ?? 0}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{run.totalRepliesPosted ?? 0}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{tuningCount}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            run.dryRun
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {run.dryRun ? 'dry run' : 'live'}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${run.startedAt}-detail`}>
                        <td colSpan={8} className="bg-gray-50 px-6 py-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Campaign Breakdown
                          </p>
                          {run.campaigns?.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full rounded border border-gray-200 text-xs">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Campaign</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-500">Posts</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-500">Comments</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-500">Matches</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-500">Replies</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-500">Match %</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Tuning Changes</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                  {run.campaigns.map(c => (
                                    <tr key={c.id}>
                                      <td className="px-3 py-2 font-medium text-gray-700">{c.id}</td>
                                      <td className="px-3 py-2 text-right text-gray-600">{c.postsScanned ?? 0}</td>
                                      <td className="px-3 py-2 text-right text-gray-600">{c.commentsChecked ?? 0}</td>
                                      <td className="px-3 py-2 text-right text-gray-600">{c.matchesFound ?? 0}</td>
                                      <td className="px-3 py-2 text-right text-gray-600">{c.repliesPosted ?? 0}</td>
                                      <td className="px-3 py-2 text-right text-gray-600">
                                        {formatPct(c.matchRatio)}
                                      </td>
                                      <td className="px-3 py-2 text-gray-500">
                                        {c.tuningChanges?.length > 0
                                          ? c.tuningChanges.map((t, ti) => (
                                              <span key={ti} className="mr-2 inline-block rounded bg-yellow-50 px-1.5 py-0.5 text-yellow-700">
                                                {tuningLabel(t)}
                                              </span>
                                            ))
                                          : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No campaign data.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
