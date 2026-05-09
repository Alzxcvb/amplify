'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = ['Product Details', 'Targeting', 'Preview & Confirm'];

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function NewCampaignPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Step 1
  const [id, setId] = useState('');
  const [product, setProduct] = useState('');
  const [url, setUrl] = useState('');
  const [pitch, setPitch] = useState('');
  const [painPointsRaw, setPainPointsRaw] = useState('');

  // Step 2
  const [audience, setAudience] = useState('');
  const [subredditsRaw, setSubredditsRaw] = useState('');
  const [active, setActive] = useState(true);

  function buildPayload() {
    const painPoints = painPointsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const subreddits = subredditsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const campaignId = id.trim() || slugify(product);
    const payload = {
      id: campaignId,
      product,
      url,
      pitch,
      pain_points: painPoints,
      active,
      platforms: { reddit: subreddits, instagram: [], facebook: [] },
    };
    if (audience.trim()) payload.audience = audience.trim();
    return payload;
  }

  function canAdvance() {
    if (step === 1) {
      const painPoints = painPointsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const campaignId = id.trim() || slugify(product);
      return campaignId && product.trim() && url.trim() && pitch.trim() && painPoints.length > 0;
    }
    if (step === 2) {
      return subredditsRaw.split(',').map(s => s.trim()).filter(Boolean).length > 0;
    }
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create campaign');
        setSubmitting(false);
        return;
      }
      router.push('/campaigns');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const payload = buildPayload();

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
          <a href="/campaigns" className="text-sm text-blue-600 hover:underline">← Cancel</a>
        </div>
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
                  step === i + 1
                    ? 'bg-blue-600 text-white'
                    : step > i + 1
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${step === i + 1 ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Product Details</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input
                type="text"
                value={product}
                onChange={e => {
                  const val = e.target.value;
                  setProduct(val);
                  if (!id || id === slugify(product)) setId(slugify(val));
                }}
                placeholder="e.g. Arrival Pass"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign ID *</label>
              <input
                type="text"
                value={id}
                onChange={e => setId(e.target.value)}
                placeholder="e.g. arrival-pass"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, hyphens only. Auto-filled from product name.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product URL *</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pitch *</label>
              <textarea
                value={pitch}
                onChange={e => setPitch(e.target.value)}
                placeholder="Describe your product and its value proposition in 1-2 sentences..."
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pain Points *</label>
              <input
                type="text"
                value={painPointsRaw}
                onChange={e => setPainPointsRaw(e.target.value)}
                placeholder="e.g. visa application, airport stress, travel delays"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">Comma-separated keywords the bot will search for across Reddit.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Targeting</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
              <textarea
                value={audience}
                onChange={e => setAudience(e.target.value)}
                placeholder="Describe who you're trying to reach — their situation, problems, and context..."
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">Optional. Helps the AI craft more relevant replies.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial Subreddits *</label>
              <input
                type="text"
                value={subredditsRaw}
                onChange={e => setSubredditsRaw(e.target.value)}
                placeholder="e.g. r/malaysia, r/digitalnomad"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">Comma-separated. e.g. r/malaysia, r/digitalnomad. The bot will discover more over time.</p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setActive(a => !a)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                  active ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    active ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-gray-700">Active</span>
              <span className="text-xs text-gray-400">
                {active ? 'Bot will include this campaign in runs' : 'Campaign is paused — bot will skip it'}
              </span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Preview & Confirm</h2>
            <p className="text-sm text-gray-500">
              This will be saved to{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">
                campaigns/{payload.id}.json
              </code>
            </p>
            <pre className="bg-gray-50 border border-gray-200 rounded-md p-4 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(payload, null, 2)}
            </pre>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
          {step > 1 ? (
            <button
              onClick={() => { setStep(s => s - 1); setError(null); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Back
            </button>
          ) : (
            <div />
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create Campaign'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
