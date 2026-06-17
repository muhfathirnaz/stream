'use client';

import { useState, useEffect } from 'react';

type Step = 'input' | 'exchange' | 'done';

const Icon = {
  Google: () => <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>,
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>,
  ArrowRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
};

export default function OAuthHelperPage() {
  const [step, setStep] = useState<Step>('input');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [redirectUri, setRedirectUri] = useState('');

  useEffect(() => {
    setRedirectUri(`${window.location.origin}/oauth-helper`);
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) { setError(`Google menolak: ${errorParam}`); setStep('input'); return; }
    if (code) {
      setClientId(localStorage.getItem('oauth_client_id') || '');
      setClientSecret(localStorage.getItem('oauth_client_secret') || '');
      setAuthCode(code); setStep('exchange');
      window.history.replaceState({}, '', '/oauth-helper');
    }
  }, []);

  const startOAuth = () => {
    if (!clientId.trim() || !clientSecret.trim()) return setError('Client ID & Secret wajib diisi.');
    setError('');
    localStorage.setItem('oauth_client_id', clientId.trim()); localStorage.setItem('oauth_client_secret', clientSecret.trim());
    const params = new URLSearchParams({
      client_id: clientId.trim(), redirect_uri: redirectUri, response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/drive.file',
      access_type: 'offline', prompt: 'consent',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  const exchangeCode = async () => {
    if (!authCode || !clientId || !clientSecret) return setError('Data tidak lengkap.');
    setLoading(true); setError('');
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: authCode, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
      const data = await res.json();
      if (data.error) return setError(data.error_description || data.error);
      if (!data.refresh_token) return setError('Gagal mendapat refresh_token. Pastikan revoke izin sebelumnya.');
      setRefreshToken(data.refresh_token); setStep('done');
      localStorage.removeItem('oauth_client_id'); localStorage.removeItem('oauth_client_secret');
    } catch (e) { setError('Gagal koneksi ke Google.'); } finally { setLoading(false); }
  };

  const copyToken = async () => { await navigator.clipboard.writeText(refreshToken); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const reset = () => { setStep('input'); setClientId(''); setClientSecret(''); setAuthCode(''); setRefreshToken(''); setError(''); };

  return (
    <div className="min-h-screen text-white apple-ui relative z-0 flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .apple-ui { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-weight: 400; letter-spacing: -0.01em; }
        .glass-card { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 10px 40px -10px rgba(0,0,0,0.3); }
        .glass-card-strong { background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(40px); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5); }
        .glass-input { background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.06); }
      `}} />

      <div className="fixed inset-0 z-[-1] bg-[#050507]">
        <div className="absolute top-0 right-0 w-[40vw] h-[40vw] bg-amber-500/10 rounded-full blur-[140px] mix-blend-screen pointer-events-none" />
      </div>

      <div className="p-4 sm:p-8 flex items-center justify-between">
         <a href="/streams" className="text-[11px] font-bold text-white/50 hover:text-white uppercase tracking-widest transition-colors">← Back to Streams</a>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          
          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">OAuth Access</h1>
            <p className="text-[11px] font-medium text-white/40 uppercase tracking-widest">Generate YouTube API Tokens</p>
          </div>

          <div className="flex items-center gap-2 mb-8 px-2">
            {(['input', 'exchange', 'done'] as Step[]).map((s, i) => {
              const isActive = step === s; const isPast = (s === 'input' && step !== 'input') || (s === 'exchange' && step === 'done');
              return (
                <div key={s} className="flex-1 flex flex-col gap-2">
                  <div className={`h-1 rounded-full transition-colors ${isActive ? 'bg-amber-400' : isPast ? 'bg-amber-400/40' : 'bg-white/10'}`} />
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? 'text-white' : 'text-white/40'}`}>Step {i+1}</span>
                </div>
              );
            })}
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold px-4 py-3 rounded-2xl mb-6">{error}</div>}

          {step === 'input' && (
            <div className="glass-card rounded-[32px] p-6 sm:p-8 animate-in slide-in-from-bottom-4">
              <div className="bg-white/5 rounded-[20px] p-4 mb-6">
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1.5">Authorized Redirect URI</div>
                <div className="text-xs font-mono text-white/70 break-all">{redirectUri || 'Loading...'}</div>
              </div>
              <div className="flex flex-col gap-4 mb-8">
                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 block pl-1">Client ID</label>
                  <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" className="w-full glass-input rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:ring-1 focus:ring-white/20" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 block pl-1">Client Secret</label>
                  <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="GOCSPX-..." className="w-full glass-input rounded-2xl px-4 py-3.5 text-sm text-white outline-none focus:ring-1 focus:ring-white/20" />
                </div>
              </div>
              <button onClick={startOAuth} className="w-full bg-white text-black py-4 rounded-full text-sm font-bold shadow-lg hover:scale-[0.98] transition-transform flex items-center justify-center gap-2"><Icon.Google /> Login with Google</button>
            </div>
          )}

          {step === 'exchange' && (
            <div className="glass-card rounded-[32px] p-6 sm:p-8 text-center animate-in slide-in-from-bottom-4">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 text-white/50"><Icon.Check /></div>
              <h3 className="text-lg font-bold text-white mb-2">Google Authenticated</h3>
              <p className="text-xs text-white/50 mb-8 px-4">Kami menerima kode otorisasi sementara. Tukarkan kode tersebut untuk mendapatkan Refresh Token permanen.</p>
              <button onClick={exchangeCode} disabled={loading} className="w-full bg-amber-400 text-black py-4 rounded-full text-sm font-bold shadow-lg hover:scale-[0.98] transition-transform disabled:opacity-50">
                {loading ? 'Processing...' : 'Generate Token'}
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="glass-card-strong rounded-[32px] p-6 sm:p-8 text-center animate-in slide-in-from-bottom-4">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4"><Icon.Check /></div>
              <h3 className="text-lg font-bold text-white mb-6">Setup Selesai</h3>
              <div className="bg-black/30 border border-white/5 rounded-2xl p-4 mb-6 relative group">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 text-left">Your Refresh Token</div>
                <div className="text-xs font-mono text-emerald-400 break-all text-left">{refreshToken}</div>
              </div>
              <button onClick={copyToken} className={`w-full py-4 rounded-full text-sm font-bold transition-all mb-4 ${copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white text-black hover:scale-[0.98]'}`}>
                {copied ? 'Tersalin ke Clipboard!' : 'Copy Token'}
              </button>
              <div className="flex gap-2">
                <a href="/streams" className="flex-1 py-3 rounded-full text-xs font-bold bg-white/10 hover:bg-white/20 transition-colors">Go to Streams</a>
                <button onClick={reset} className="px-4 py-3 rounded-full text-xs font-bold text-white/40 hover:text-white transition-colors">Reset</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
