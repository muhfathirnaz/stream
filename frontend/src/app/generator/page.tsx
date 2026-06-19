'use client';
import { useState, useEffect } from 'react';

export default function GeneratorPage() {
  const [loadingVisual, setLoadingVisual] = useState(false);
  const [results, setResults] = useState<any[]>([]);

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

  const handleGenerateAudio = () => alert('Fitur Audio Generator belum dibuat!');

  return (
    <div className="p-8 text-white min-h-screen bg-[#0a0a0a]">
      <h1 className="text-2xl font-bold mb-6">Asset Generator</h1>
      <div className="flex gap-4 mb-8">
        <button 
          onClick={handleGenerateVisual}
          disabled={loadingVisual}
          className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-md font-semibold disabled:opacity-50 transition-all"
        >
          {loadingVisual ? 'Memproses di n8n...' : 'Generate Visual'}
        </button>
        <button 
          onClick={handleGenerateAudio}
          className="bg-purple-600 hover:bg-purple-500 px-6 py-2 rounded-md font-semibold transition-all"
        >
          Generate Audio
        </button>
      </div>
      {results.length > 0 && (
        <div className="bg-[#1a1a1a] p-6 rounded-lg border border-[#333]">
          <h2 className="text-xl font-semibold mb-4 text-green-400">Visual Generated Successfully!</h2>
          <div className="grid gap-6">
            {results.map((item, idx) => (
              <div key={idx} className="bg-black p-4 rounded border border-gray-800">
                <h3 className="text-lg font-bold text-pink-500 capitalize mb-2">
                  Target: {item._destination.replace('_', ' ')}
                </h3>
                <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {item.prompt}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
