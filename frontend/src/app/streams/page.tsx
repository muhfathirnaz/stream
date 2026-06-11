'use client';

import { useEffect, useState, useCallback } from 'react';

interface Channel {
  id: number;
  channel_id: string;
  name: string;
  google_refresh_token?: string;
  stream_status?: string;
  activeStreams: { streamId: string; elapsedSeconds: number }[];
}

interface Schedule {
  id: number;
  channel_id: string;
  channel_name: string;
  scheduled_at: string;
  duration_secs: number;
  title: string;
  status: string;
}

function UTCClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toUTCString().slice(17, 25));
      setDate(now.toUTCString().slice(0, 16));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-1.5">
      <span className="text-[10px] text-[#6b7280] font-mono uppercase tracking-widest">UTC</span>
      <span className="text-sm font-mono text-[#c8f55a] tabular-nums">{time}</span>
      <span className="text-xs font-mono text-[#6b7280]">{date}</span>
    </div>
  );
}

function formatElapsed(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}j ${m}m ${s}d`;
}

function formatScheduleTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

function getUTCDatetimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
}

function getCountdown(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'sebentar lagi...';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}j ${m}m lagi`;
  return `${m}m lagi`;
}

export default function StreamsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newRefreshToken, setNewRefreshToken] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<{ [key: string]: { datetime: string; duration: number } }>({});
  const [showScheduleFor, setShowScheduleFor] = useState<string | null>(null);
  const [editingTokenFor, setEditingTokenFor] = useState<string | null>(null);
  const [editTokenValue, setEditTokenValue] = useState('');
  const [countdown, setCountdown] = useState<{ [key: number]: string }>({});

  const fetchChannels = useCallback(async () => {
    try {
      const [chRes, stRes] = await Promise.all([
        fetch('/api/channels'),
        fetch('/api/streams/status'),
      ]);
      if (chRes.ok) {
        const chData = await chRes.json();
        const activeStreams: { streamId: string; channelId: string; elapsedSeconds: number }[] = stRes.ok ? await stRes.json() : [];
        const merged = chData.map((ch: Channel) => ({
          ...ch,
          stream_status: activeStreams.some(s => s.channelId === ch.channel_id) ? 'live' : 'stopped',
          activeStreams: activeStreams
            .filter(s => s.channelId === ch.channel_id)
            .map(s => ({ streamId: s.streamId, elapsedSeconds: s.elapsedSeconds })),
        }));
        setChannels(merged);
      }
    } catch (err) { console.error(err); }
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      if (res.ok) setSchedules(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => {
    fetchChannels();
    fetchSchedules();
    const interval = setInterval(() => {
      fetchChannels();
      fetchSchedules();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchChannels, fetchSchedules]);

  // Update countdown tiap 30 detik
  useEffect(() => {
    const update = () => {
      const counts: { [key: number]: string } = {};
      schedules.filter(s => s.status === 'pending').forEach(s => {
        counts[s.id] = getCountdown(s.scheduled_at);
      });
      setCountdown(counts);
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [schedules]);

  const startStream = async (channelId: string, durationSecs = 14400) => {
    setLoading(true);
    try {
      const res = await fetch('/api/streams/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, durationSecs, title: 'Lofi Jazz Radio - Live Stream' }),
      });
      if (!res.ok) { const err = await res.json(); alert('Gagal start: ' + err.error); }
      await fetchChannels();
    } finally { setLoading(false); }
  };

  const stopStream = async (streamId: string) => {
    setLoading(true);
    try {
      await fetch('/api/streams/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId }),
      });
      await fetchChannels();
    } finally { setLoading(false); }
  };

  const addChannel = async () => {
    if (!newChannelName.trim()) return;
    if (!newRefreshToken.trim()) {
      alert('Refresh token wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChannelName.trim(), refresh_token: newRefreshToken.trim() }),
      });
      if (!res.ok) { const err = await res.json(); alert('Gagal: ' + err.error); }
      else { setNewChannelName(''); setNewRefreshToken(''); setShowAddForm(false); await fetchChannels(); }
    } finally { setLoading(false); }
  };

  const updateRefreshToken = async (channelId: string) => {
    if (!editTokenValue.trim()) return;
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: editTokenValue.trim() }),
      });
      if (!res.ok) { const err = await res.json(); alert('Gagal: ' + err.error); }
      else { setEditingTokenFor(null); setEditTokenValue(''); await fetchChannels(); }
    } catch (err) { console.error(err); }
  };

  const deleteChannel = async (channelId: string) => {
    if (!confirm(`Hapus channel ${channelId}?`)) return;
    await fetch(`/api/channels/${channelId}`, { method: 'DELETE' });
    await fetchChannels();
  };

  const scheduleStream = async (channelId: string) => {
    const form = scheduleForm[channelId];
    if (!form?.datetime) return alert('Pilih tanggal & jam dulu!');

    const scheduledAt = new Date(form.datetime + ':00Z').toISOString();
    if (new Date(scheduledAt) <= new Date()) return alert('Waktu sudah lewat!');

    setLoading(true);
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          scheduledAt,
          durationSecs: (form.duration || 4) * 3600,
          title: 'Lofi Jazz Radio - Live Stream',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Gagal schedule: ' + err.error);
      } else {
        setShowScheduleFor(null);
        await fetchSchedules();
      }
    } finally { setLoading(false); }
  };

  const cancelSchedule = async (scheduleId: number) => {
    if (!confirm('Cancel schedule ini?')) return;
    await fetch(`/api/schedules/${scheduleId}`, { method: 'DELETE' });
    await fetchSchedules();
  };

  const initScheduleForm = (channelId: string) => {
    if (!scheduleForm[channelId]) {
      setScheduleForm(prev => ({
        ...prev,
        [channelId]: { datetime: getUTCDatetimeLocal(), duration: 4 }
      }));
    }
    setShowScheduleFor(channelId);
  };

  const pendingSchedules = schedules.filter(s => s.status === 'pending');
  const recentSchedules = schedules.filter(s => s.status !== 'pending');

  return (
    <main className="min-h-screen bg-[#0a0c0f] text-[#e8e6e0] font-sans">
      <header className="h-14 bg-[#111318] border-b border-[#2a2e38] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-[#6b7280] hover:text-[#e8e6e0] font-mono transition-colors">← Dashboard</a>
          <h1 className="text-sm font-bold tracking-widest text-[#c8f55a] uppercase">Live Streams</h1>
        </div>
        <div className="flex items-center gap-3">
          <a href="/oauth-helper" className="text-[10px] font-mono text-[#6b7280] border border-[#2a2e38] px-3 py-1.5 rounded hover:border-[#c8f55a] hover:text-[#c8f55a] transition-colors">
            ⚙ OAuth Token Generator
          </a>
          <UTCClock />
        </div>
      </header>

      <div className="p-6 max-w-3xl mx-auto">

        {/* Pending Schedules Panel */}
        {pendingSchedules.length > 0 && (
          <div className="bg-[#111318] border border-[#f5c85a33] rounded-lg p-4 mb-5">
            <div className="text-[10px] text-[#f5c85a] uppercase tracking-widest font-mono mb-3">
              ⏰ Scheduled Streams ({pendingSchedules.length})
            </div>
            <div className="flex flex-col gap-2">
              {pendingSchedules.map(s => (
                <div key={s.id} className="flex items-center justify-between bg-[#0d0f12] rounded px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#f5c85a] animate-pulse" />
                    <div>
                      <div className="text-xs font-mono text-[#e8e6e0]">{s.channel_name}</div>
                      <div className="text-[10px] font-mono text-[#6b7280]">
                        {formatScheduleTime(s.scheduled_at)} · {Math.round(s.duration_secs / 3600)}j
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-[#f5c85a]">
                      {countdown[s.id] || getCountdown(s.scheduled_at)}
                    </span>
                    <button
                      onClick={() => cancelSchedule(s.id)}
                      className="text-[10px] text-[#6b7280] hover:text-[#f5655a] font-mono transition-colors"
                    >
                      ✕ Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Schedule History */}
        {recentSchedules.length > 0 && (
          <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-4 mb-5">
            <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-3">
              Riwayat Schedule (24 jam terakhir)
            </div>
            <div className="flex flex-col gap-1">
              {recentSchedules.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-[#0d0f12]">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      s.status === 'done' ? 'bg-[#0a1a0a] text-[#5af5c8] border border-[#1a3a1a]' :
                      s.status === 'failed' ? 'bg-[#1a0a0a] text-[#f5655a] border border-[#3a1a1a]' :
                      'bg-[#1a1500] text-[#f5c85a] border border-[#3a2a00]'
                    }`}>
                      {s.status}
                    </span>
                    <span className="text-xs font-mono text-[#6b7280]">{s.channel_name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#3a3e48]">
                    {formatScheduleTime(s.scheduled_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top bar channels */}
        <div className="flex items-center justify-between mb-5">
          <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono">
            {channels.length} channel · {channels.filter(c => c.stream_status === 'live').length} live sekarang
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs px-4 py-2 rounded border border-[#c8f55a] text-[#c8f55a] hover:bg-[#c8f55a] hover:text-[#0a0c0f] transition-colors font-mono"
          >
            + Tambah Channel
          </button>
        </div>

        {/* Add channel form */}
        {showAddForm && (
          <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-5 mb-5">
            <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-4">Channel Baru</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Nama Channel</label>
                <input
                  type="text"
                  placeholder="contoh: Lofi Jazz Monet"
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  className="w-full bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-sm font-mono focus:border-[#c8f55a] outline-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-[#6b7280] font-mono">
                    Google Refresh Token <span className="text-[#f5655a]">*</span>
                  </label>
                  <a href="/oauth-helper" target="_blank" className="text-[10px] text-[#c8f55a] font-mono hover:underline">
                    Belum punya? Generate di sini →
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    placeholder="1//0g..."
                    value={newRefreshToken}
                    onChange={e => setNewRefreshToken(e.target.value)}
                    className="w-full bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-sm font-mono focus:border-[#c8f55a] outline-none pr-20"
                  />
                  <button
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#6b7280] hover:text-[#e8e6e0] font-mono"
                  >
                    {showToken ? 'sembunyikan' : 'tampilkan'}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={addChannel}
                disabled={loading || !newChannelName.trim() || !newRefreshToken.trim()}
                className="flex-1 py-2 bg-[#c8f55a] text-[#0a0c0f] rounded text-xs font-bold font-mono disabled:opacity-40 hover:bg-[#b8e54a] transition-colors"
              >
                Simpan Channel
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewChannelName(''); setNewRefreshToken(''); }}
                className="px-4 py-2 border border-[#2a2e38] rounded text-xs font-mono text-[#6b7280] hover:text-[#e8e6e0]"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Channel list */}
        <div className="flex flex-col gap-4">
          {channels.length === 0 && (
            <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-8 text-center text-[#6b7280] text-sm font-mono">
              Belum ada channel.
            </div>
          )}

          {channels.map(ch => {
            const schedForm = scheduleForm[ch.channel_id] || { datetime: getUTCDatetimeLocal(), duration: 4 };
            const isShowingSchedule = showScheduleFor === ch.channel_id;
            const hasToken = !!ch.google_refresh_token;
            const isLive = ch.stream_status === 'live';
            const chSchedule = pendingSchedules.find(s => s.channel_id === ch.channel_id);

            return (
              <div
                key={ch.channel_id}
                className={`bg-[#111318] border rounded-lg p-5 transition-colors ${isLive ? 'border-[#c8f55a]' : 'border-[#2a2e38]'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold">{ch.name}</div>
                    <div className="text-xs text-[#6b7280] font-mono mt-0.5">{ch.channel_id}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      hasToken ? 'bg-[#0a1a0a] text-[#5af5c8] border border-[#1a3a1a]' : 'bg-[#1a0a0a] text-[#f5655a] border border-[#3a1a1a]'
                    }`}>
                      {hasToken ? '✓ token' : '✗ no token'}
                    </div>
                    {isLive && (
                      <div className="flex items-center gap-1.5 text-[#f5655a] text-xs font-mono">
                        <span className="w-2 h-2 rounded-full bg-[#f5655a] animate-pulse" />
                        LIVE
                      </div>
                    )}
                    {chSchedule && !isLive && (
                      <div className="flex items-center gap-1.5 text-[#f5c85a] text-xs font-mono">
                        <span className="w-2 h-2 rounded-full bg-[#f5c85a] animate-pulse" />
                        SCHEDULED
                      </div>
                    )}
                    <button onClick={() => deleteChannel(ch.channel_id)} className="text-[#6b7280] hover:text-[#f5655a] text-xs font-mono">
                      Hapus
                    </button>
                  </div>
                </div>

                {!hasToken && (
                  <div className="bg-[#1a0e00] border border-[#3a2a00] rounded p-3 mb-3 flex items-center justify-between">
                    <span className="text-[11px] text-[#f5c85a] font-mono">Belum ada refresh token.</span>
                    <button
                      onClick={() => { setEditingTokenFor(ch.channel_id); setEditTokenValue(''); }}
                      className="text-[10px] text-[#f5c85a] border border-[#f5c85a33] rounded px-2 py-1 font-mono hover:bg-[#2a1a00] ml-3 whitespace-nowrap"
                    >
                      + Tambah Token
                    </button>
                  </div>
                )}

                {editingTokenFor === ch.channel_id && (
                  <div className="bg-[#0d0f12] border border-[#2a2e38] rounded p-3 mb-3">
                    <div className="text-[10px] text-[#6b7280] font-mono mb-2">
                      Update Refresh Token
                      <a href="/oauth-helper" target="_blank" className="text-[#c8f55a] ml-2 hover:underline">(generate baru →)</a>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={editTokenValue}
                        onChange={e => setEditTokenValue(e.target.value)}
                        placeholder="1//0g..."
                        className="flex-1 bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-1.5 text-xs font-mono focus:border-[#c8f55a] outline-none"
                      />
                      <button
                        onClick={() => updateRefreshToken(ch.channel_id)}
                        disabled={!editTokenValue.trim()}
                        className="px-3 py-1.5 bg-[#c8f55a] text-[#0a0c0f] rounded text-xs font-bold font-mono disabled:opacity-40"
                      >
                        Simpan
                      </button>
                      <button onClick={() => setEditingTokenFor(null)} className="px-3 py-1.5 border border-[#2a2e38] rounded text-xs font-mono text-[#6b7280]">
                        Batal
                      </button>
                    </div>
                  </div>
                )}

                {ch.activeStreams?.length > 0 && (
                  <div className="mb-3 flex flex-col gap-2">
                    {ch.activeStreams.map(s => (
                      <div key={s.streamId} className="flex items-center justify-between bg-[#0d0f12] border border-[#1a2a1a] rounded px-3 py-2">
                        <div>
                          <span className="text-xs font-mono text-[#6b7280]">ID: {s.streamId.slice(0, 8)}...</span>
                          <span className="text-xs font-mono text-[#c8f55a] ml-3">⏱ {formatElapsed(s.elapsedSeconds)}</span>
                        </div>
                        <button
                          onClick={() => stopStream(s.streamId)}
                          disabled={loading}
                          className="text-xs px-3 py-1 rounded border border-[#3a1a1a] text-[#f5655a] hover:bg-[#1a0a0a] font-mono disabled:opacity-50"
                        >
                          ■ Stop
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {!isLive && (
                    <button
                      onClick={() => startStream(ch.channel_id)}
                      disabled={loading || !hasToken}
                      className="flex-1 py-2 rounded bg-[#c8f55a] text-[#0a0c0f] text-xs font-bold font-mono hover:bg-[#b8e54a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ▶ Start Sekarang (4 jam)
                    </button>
                  )}

                  {!chSchedule && !isLive && (
                    <button
                      onClick={() => initScheduleForm(ch.channel_id)}
                      disabled={!hasToken}
                      className="flex-1 py-2 rounded border border-[#f5c85a] text-[#f5c85a] text-xs font-mono hover:bg-[#1a1500] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ⏰ Schedule
                    </button>
                  )}

                  {hasToken && editingTokenFor !== ch.channel_id && (
                    <button
                      onClick={() => { setEditingTokenFor(ch.channel_id); setEditTokenValue(''); }}
                      className="px-3 py-2 border border-[#2a2e38] rounded text-[10px] font-mono text-[#3a3e48] hover:text-[#6b7280] hover:border-[#3a3e48] transition-colors"
                      title="Update refresh token"
                    >
                      🔑
                    </button>
                  )}
                </div>

                {isShowingSchedule && !chSchedule && (
                  <div className="mt-3 bg-[#0d0f12] border border-[#f5c85a33] rounded-lg p-4">
                    <div className="text-[10px] text-[#f5c85a] uppercase tracking-widest font-mono mb-3">
                      Jadwalkan Stream — Waktu dalam UTC
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Tanggal & Jam (UTC)</label>
                        <input
                          type="datetime-local"
                          value={schedForm.datetime}
                          onChange={e => setScheduleForm(prev => ({ ...prev, [ch.channel_id]: { ...schedForm, datetime: e.target.value } }))}
                          className="w-full bg-[#111318] border border-[#2a2e38] rounded px-3 py-2 text-xs font-mono focus:border-[#f5c85a] outline-none text-[#e8e6e0]"
                        />
                        <div className="text-[10px] text-[#6b7280] font-mono mt-1">
                          UTC sekarang: {new Date().toUTCString().slice(17, 22)}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Durasi</label>
                        <div className="grid grid-cols-4 gap-1">
                          {[1, 2, 3, 4, 6, 8, 10, 12].map(h => (
                            <button
                              key={h}
                              onClick={() => setScheduleForm(prev => ({ ...prev, [ch.channel_id]: { ...schedForm, duration: h } }))}
                              className={`py-2 rounded text-xs font-mono transition-colors ${
                                schedForm.duration === h
                                  ? 'bg-[#f5c85a] text-[#0a0c0f] font-bold'
                                  : 'border border-[#2a2e38] text-[#6b7280] hover:border-[#f5c85a] hover:text-[#f5c85a]'
                              }`}
                            >
                              {h}j
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => scheduleStream(ch.channel_id)}
                        disabled={loading}
                        className="flex-1 py-2 rounded bg-[#f5c85a] text-[#0a0c0f] text-xs font-bold font-mono hover:bg-[#e5b84a] transition-colors disabled:opacity-50"
                      >
                        ✓ Konfirmasi Schedule
                      </button>
                      <button
                        onClick={() => setShowScheduleFor(null)}
                        className="px-4 py-2 rounded border border-[#2a2e38] text-xs font-mono text-[#6b7280]"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
