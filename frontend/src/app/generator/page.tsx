
'use client';
import { useState, useEffect } from 'react';

export default function GeneratorPage() {
  const [activeTab, setActiveTab] = useState<'visual' | 'audio'>('visual');
  const [loadingVisual, setLoadingVisual] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const targetFields = ['thumbnail', 'image_preview', 'video'];

  useEffect(() => {
    const ws = new WebSocket('wss://aksarastream.ddns.net/ws');
    
    ws.onopen = () => console.log('WebSocket Connected');
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'generator_visual_done') {
          console.log('Dapat hasil dari n8n:', data.payload);
          setResults(data.payload);
          setLoadingVisual(false);
        }
      } catch (err) {
        console.error('WS Parse Error:', err);
      }
    };
    
    return () => ws.close();
  }, []);

  const handleGenerateVisual = async () => {
    setLoadingVisual(true);
    setResults([]);
    try {
      const res = await fetch('https://aksarastream.ddns.net/api/generator/visual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.success) {
        alert('Gagal trigger n8n: (' + data.error + ')');
        setLoadingVisual(false);
      }
    } catch (error) {
      console.error(error);
      alert('Error koneksi ke backend');
      setLoadingVisual(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="p-8 text-white min-h-screen bg-black">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-semibold mb-8 tracking-tight text-zinc-100">Asset Generator</h1>
        
        {/* TABS (Segmented Control Style) */}
        <div className="flex bg-zinc-900/60 p-1.5 rounded-xl w-fit mb-10 border border-white/5 shadow-inner">
          <button
            onClick={() => setActiveTab('visual')}
            className={`px-8 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
              activeTab === 'visual' 
                ? 'bg-white text-black shadow-md scale-100' 
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 scale-95'
            }`}
          >
            Visual Generator
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`px-8 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
              activeTab === 'audio' 
                ? 'bg-white text-black shadow-md scale-100' 
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 scale-95'
            }`}
          >
            Audio Generator
          </button>
        </div>

        {/* ================= TAB VISUAL ================= */}
        {activeTab === 'visual' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <button 
                onClick={handleGenerateVisual}
                disabled={loadingVisual}
                className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-medium hover:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
                {loadingVisual ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    Memproses di n8n...
                  </>
                ) : '✨ Generate Visual Prompts'}
              </button>
            </div>

            <div className="bg-zinc-900/40 backdrop-blur-xl p-8 rounded-3xl border border-white/5 shadow-2xl">
              <h2 className="text-xl font-medium mb-6 text-zinc-100 flex items-center gap-3 tracking-tight">
                <span className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${
                  loadingVisual ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 
                  results.length > 0 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 
                  'bg-zinc-600'
                }`}></span>
                {loadingVisual ? 'Generating prompts...' : results.length > 0 ? 'Visual Prompts Ready' : 'Ready to Generate'}
              </h2>
              
              <div className="grid gap-6">
                {targetFields.map((field, idx) => {
                  const resultItem = results.find(r => r._destination === field);
                  const promptText = resultItem ? resultItem.prompt : '';

                  return (
                    <div key={idx} className="bg-black/40 p-5 rounded-2xl border border-white/5 relative group transition-all hover:border-white/10">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                          {field.replace('_', ' ')}
                        </h3>
                        
                        <button
                          onClick={() => promptText && handleCopy(promptText, idx)}
                          disabled={!promptText}
                          className={`text-xs px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 border ${
                            promptText 
                              ? 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-300 active:scale-95 cursor-pointer' 
                              : 'bg-zinc-900/30 border-transparent text-zinc-700 cursor-not-allowed'
                          }`}
                        >
                          {copiedIndex === idx ? (
                            <span className="text-green-400 font-medium">Copied!</span>
                          ) : (
                            <span className="font-medium">Copy</span>
                          )}
                        </button>
                      </div>
                      
                      <div className="bg-zinc-950/80 p-5 rounded-xl border border-white/5 min-h-[120px] max-h-[300px] overflow-y-auto custom-scrollbar shadow-inner relative flex flex-col justify-center">
                        {promptText ? (
                          <p className="text-[13px] text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed h-full">
                            {promptText}
                          </p>
                        ) : loadingVisual ? (
                          <div className="animate-pulse flex flex-col gap-3 w-full absolute top-5 left-5 right-5">
                            <div className="h-2.5 bg-zinc-800/80 rounded-full w-full"></div>
                            <div className="h-2.5 bg-zinc-800/80 rounded-full w-[90%]"></div>
                            <div className="h-2.5 bg-zinc-800/80 rounded-full w-[75%]"></div>
                            <div className="h-2.5 bg-zinc-800/80 rounded-full w-[85%]"></div>
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-700 font-mono text-center absolute inset-0 flex items-center justify-center">
                            Awaiting generation...
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB AUDIO ================= */}
        {activeTab === 'audio' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-zinc-900/40 backdrop-blur-xl p-12 rounded-3xl border border-white/5 shadow-2xl flex flex-col items-center justify-center text-center min-h-[400px]">
              <div className="w-16 h-16 bg-zinc-800/50 rounded-2xl flex items-center justify-center mb-6 border border-white/5">
                <span className="text-3xl">🎵</span>
              </div>
              <h2 className="text-2xl font-semibold text-zinc-100 mb-3 tracking-tight">Audio Generator</h2>
              <p className="text-zinc-500 max-w-sm leading-relaxed">
                Fitur ini sedang dalam tahap pengembangan. Segera hadir untuk men-generate asset audio lo secara otomatis.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
