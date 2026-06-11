'use client';

import { useEffect, useState, useCallback } from 'react';

interface Channel {
  id: number;
  channel_id: string;
  name: string;
  isLive: boolean;
  activeStreams: { streamId: string; elapsedSeconds: number }[];
}

interface Schedule {
  channelId: string;
  datetime: string;
  duration: number;
  timerId?: ReturnType<typeof setTimeout>;
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

function getUTCDatetimeLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
}

export default function StreamsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<{ [key: string]: { datetime: string; duration: number } }>({});
  const [showScheduleFor, setShowScheduleFor] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchChannels();
    const interval = setInterval(fetchChannels, 5000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  const startStream = async (channelId: string, durationSecs = 14400) => {
    setLoading(true);
    try {
      const res = await fetch('/api/streams/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, durationSecs, title: 'Lofi Jazz Radio - Live Stream' }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Gagal start: ' + err.error);
      }
      await fetchChannels();
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
  };

  const addChannel = async () => {
    if (!newChannelName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChannelName }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Gagal: ' + err.error);
      } else {
        setNewChannelName('');
        setShowAddForm(false);
        await fetchChannels();
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteChannel = async (channelId: string) => {
    if (!confirm(`Hapus channel ${channelId}?`)) return;
    await fetch(`/api/channels/${channelId}`, { method: 'DELETE' });
    await fetchChannels();
  };

  const scheduleStream = (channelId: string) => {
    const form = scheduleForm[channelId];
    if (!form?.datetime) return alert('Pilih tanggal & jam dulu!');

    // Input dianggap UTC
    const startAt = new Date(form.datetime + ':00Z').getTime();
    const now = Date.now();
    const delay = startAt - now;

    if (delay <= 0) return alert('Waktu sudah lewat! Pilih waktu UTC yang belum terjadi.');

    const timerId = setTimeout(() => {
      startStream(channelId, (form.duration || 4) * 3600);
      setSchedules(prev => prev.filter(s => s.channelId !== channelId));
    }, delay);

    setSchedules(prev => [
      ...prev.filter(s => s.channelId !== channelId),
      { channelId, datetime: form.datetime, duration: form.duration || 4, timerId }
    ]);

    setShowScheduleFor(null);
    alert(`Stream dijadwalkan: ${form.datetime} UTC selama ${form.duration || 4} jam`);
  };

  const cancelSchedule = (channelId: string) => {
    const s = schedules.find(s => s.channelId === channelId);
    if (s?.timerId) clearTimeout(s.timerId);
    setSchedules(prev => prev.filter(s => s.channelId !== channelId));
  };

  const getSchedule = (channelId: string) => schedules.find(s => s.channelId === channelId);

  const initScheduleForm = (channelId: string) => {
    if (!scheduleForm[channelId]) {
      setScheduleForm(prev => ({
        ...prev,
        [channelId]: { datetime: getUTCDatetimeLocal(), duration: 4 }
      }));
    }
    setShowScheduleFor(channelId);
  };

  return (
    <main className="min-h-screen bg-[#0a0c0f] text-[#e8e6e0] font-sans">
      {/* Header */}
      <header className="h-14 bg-[#111318] border-b border-[#2a2e38] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-[#6b7280] hover:text-[#e8e6e0] font-mono transition-colors">← Dashboard</a>
          <h1 className="text-sm font-bold tracking-widest text-[#c8f55a] uppercase">Live Streams</h1>
        </div>
        <UTCClock />
      </header>

      <div className="p-6 max-w-3xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono">
            {channels.length} channel · {channels.filter(c => c.isLive).length} live sekarang
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
          <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-4 mb-5">
            <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-3">Channel Baru</div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Nama channel (contoh: Lofi Jazz Monet)"
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChannel()}
                className="flex-1 bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-sm font-mono focus:border-[#c8f55a] outline-none"
              />
              <button
                onClick={addChannel}
                disabled={loading}
                className="px-4 py-2 bg-[#c8f55a] text-[#0a0c0f] rounded text-xs font-bold font-mono disabled:opacity-50"
              >
                Simpan
              </button>
              <button
                onClick={() => setShowAddForm(false)}
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
              Belum ada channel. Klik "+ Tambah Channel" untuk mulai.
            </div>
          )}

          {channels.map(ch => {
            const sched = getSchedule(ch.channel_id);
            const schedForm = scheduleForm[ch.channel_id] || { datetime: '', duration: 4 };
            const isShowingSchedule = showScheduleFor === ch.channel_id;

            return (
              <div
                key={ch.channel_id}
                className={`bg-[#111318] border rounded-lg p-5 transition-colors ${ch.isLive ? 'border-[#c8f55a]' : 'border-[#2a2e38]'}`}
              >
                {/* Channel header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-semibold">{ch.name}</div>
                    <div className="text-xs text-[#6b7280] font-mono mt-0.5">{ch.channel_id}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {ch.isLive && (
                      <div className="flex items-center gap-1.5 text-[#f5655a] text-xs font-mono">
                        <span className="w-2 h-2 rounded-full bg-[#f5655a] animate-pulse" />
                        LIVE
                      </div>
                    )}
                    {sched && !ch.isLive && (
                      <div className="flex items-center gap-1.5 text-[#f5c85a] text-xs font-mono">
                        <span className="w-2 h-2 rounded-full bg-[#f5c85a] animate-pulse" />
                        SCHEDULED
                      </div>
                    )}
                    <button
                      onClick={() => deleteChannel(ch.channel_id)}
                      className="text-[#6b7280] hover:text-[#f5655a] text-xs font-mono transition-colors"
                    >
                      Hapus
                    </button>
                  </div>
                </div>

                {/* Active streams */}
                {ch.activeStreams.length > 0 && (
                  <div className="mb-4 flex flex-col gap-2">
                    {ch.activeStreams.map(s => (
                      <div key={s.streamId} className="flex items-center justify-between bg-[#0d0f12] border border-[#1a2a1a] rounded px-3 py-2">
                        <div>
                          <span className="text-xs font-mono text-[#6b7280]">ID: {s.streamId.slice(0, 8)}...</span>
                          <span className="text-xs font-mono text-[#c8f55a] ml-3">⏱ {formatElapsed(s.elapsedSeconds)}</span>
                        </div>
                        <button
                          onClick={() => stopStream(s.streamId)}
                          disabled={loading}
                          className="text-xs px-3 py-1 rounded border border-[#3a1a1a] text-[#f5655a] hover:bg-[#1a0a0a] transition-colors font-mono disabled:opacity-50"
                        >
                          ■ Stop
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {!ch.isLive && (
                    <button
                      onClick={() => startStream(ch.channel_id)}
                      disabled={loading}
                      className="flex-1 py-2 rounded bg-[#c8f55a] text-[#0a0c0f] text-xs font-bold font-mono hover:bg-[#b8e54a] transition-colors disabled:opacity-50"
                    >
                      ▶ Start Sekarang (4 jam)
                    </button>
                  )}

                  {!sched && (
                    <button
                      onClick={() => initScheduleForm(ch.channel_id)}
                      className="flex-1 py-2 rounded border border-[#f5c85a] text-[#f5c85a] text-xs font-mono hover:bg-[#1a1500] transition-colors"
                    >
                      ⏰ Schedule
                    </button>
                  )}

                  {sched && (
                    <div className="flex-1 flex items-center justify-between bg-[#1a1500] border border-[#f5c85a33] rounded px-3 py-2">
                      <span className="text-xs font-mono text-[#f5c85a]">
                        ⏰ {sched.datetime} UTC · {sched.duration}j
                      </span>
                      <button
                        onClick={() => cancelSchedule(ch.channel_id)}
                        className="text-xs text-[#6b7280] hover:text-[#f5655a] font-mono ml-3"
                      >
                        ✕ Batal
                      </button>
                    </div>
                  )}
                </div>

                {/* Schedule form popup */}
                {isShowingSchedule && !sched && (
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
                          onChange={e => setScheduleForm(prev => ({
                            ...prev,
                            [ch.channel_id]: { ...schedForm, datetime: e.target.value }
                          }))}
                          className="w-full bg-[#111318] border border-[#2a2e38] rounded px-3 py-2 text-xs font-mono focus:border-[#f5c85a] outline-none text-[#e8e6e0]"
                        />
                        <div className="text-[10px] text-[#6b7280] font-mono mt-1">
                          Input dalam UTC — server jam sekarang UTC: {new Date().toUTCString().slice(17, 22)}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Durasi</label>
                        <div className="grid grid-cols-4 gap-1">
                          {[1, 2, 3, 4, 6, 8, 10, 12].map(h => (
                            <button
                              key={h}
                              onClick={() => setScheduleForm(prev => ({
                                ...prev,
                                [ch.channel_id]: { ...schedForm, duration: h }
                              }))}
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
                        className="flex-1 py-2 rounded bg-[#f5c85a] text-[#0a0c0f] text-xs font-bold font-mono hover:bg-[#e5b84a] transition-colors"
                      >
                        ✓ Konfirmasi Schedule
                      </button>
                      <button
                        onClick={() => setShowScheduleFor(null)}
                        className="px-4 py-2 rounded border border-[#2a2e38] text-xs font-mono text-[#6b7280] hover:text-[#e8e6e0]"
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
