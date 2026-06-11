'use client';

import { useState, useEffect } from 'react';

type Step = 'input' | 'authorize' | 'exchange' | 'done';

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
    // Set redirectUri hanya di client-side, bukan SSR
    setRedirectUri(`${window.location.origin}/oauth-helper`);

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setError(`Google menolak: ${errorParam}`);
      setStep('input');
      return;
    }

    if (code) {
      const savedClientId = localStorage.getItem('oauth_client_id') || '';
      const savedClientSecret = localStorage.getItem('oauth_client_secret') || '';
      setClientId(savedClientId);
      setClientSecret(savedClientSecret);
      setAuthCode(code);
      setStep('exchange');
      window.history.replaceState({}, '', '/oauth-helper');
    }
  }, []);

  const startOAuth = () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Client ID dan Client Secret harus diisi.');
      return;
    }
    setError('');
    localStorage.setItem('oauth_client_id', clientId.trim());
    localStorage.setItem('oauth_client_secret', clientSecret.trim());

    const params = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.force-ssl',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  const exchangeCode = async () => {
    if (!authCode || !clientId || !clientSecret) {
      setError('Data tidak lengkap untuk exchange token.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: authCode,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(`Error dari Google: ${data.error_description || data.error}`);
        return;
      }

      if (!data.refresh_token) {
        setError('Tidak dapat refresh_token. Pastikan lo pilih "Allow" dan akun belum pernah di-authorize sebelumnya (atau revoke dulu di myaccount.google.com/permissions).');
        return;
      }

      setRefreshToken(data.refresh_token);
      setStep('done');
      localStorage.removeItem('oauth_client_id');
      localStorage.removeItem('oauth_client_secret');
    } catch (e) {
      setError('Gagal koneksi ke Google. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    await navigator.clipboard.writeText(refreshToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setStep('input');
    setClientId('');
    setClientSecret('');
    setAuthCode('');
    setRefreshToken('');
    setError('');
  };

  return (
    <main className="min-h-screen bg-[#0a0c0f] text-[#e8e6e0] font-sans flex flex-col">
      <header className="h-14 bg-[#111318] border-b border-[#2a2e38] flex items-center px-6 gap-4">
        <a href="/streams" className="text-xs text-[#6b7280] hover:text-[#e8e6e0] font-mono transition-colors">
          ← Streams
        </a>
        <h1 className="text-sm font-bold tracking-widest text-[#c8f55a] uppercase">
          OAuth Token Generator
        </h1>
        <span className="text-xs text-[#6b7280] font-mono">
          Generate YouTube refresh token tanpa VPS
        </span>
      </header>

      <div className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-lg">

          {/* Stepper */}
          <div className="flex items-center gap-2 mb-8">
            {(['input', 'exchange', 'done'] as Step[]).map((s, i) => {
              const labels = ['1. Masukkan Credentials', '2. Exchange Code', '3. Token Siap'];
              const isActive = step === s;
              const isDone = (
                (s === 'input' && (step === 'exchange' || step === 'done')) ||
                (s === 'exchange' && step === 'done')
              );
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className={`text-[10px] font-mono whitespace-nowrap px-2 py-1 rounded transition-colors
                    ${isActive ? 'text-[#c8f55a] border border-[#c8f55a]' : ''}
                    ${isDone ? 'text-[#6b7280] line-through' : ''}
                    ${!isActive && !isDone ? 'text-[#3a3e48]' : ''}
                  `}>
                    {labels[i]}
                  </div>
                  {i < 2 && <div className="flex-1 h-px bg-[#2a2e38]" />}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="bg-[#1a0a0a] border border-[#3a1a1a] rounded-lg p-4 mb-5 text-sm text-[#f5655a] font-mono">
              {error}
            </div>
          )}

          {/* Step 1: Input */}
          {step === 'input' && (
            <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-6">
              <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-4">
                Google Cloud Credentials
              </div>

              <div className="bg-[#0d0f12] border border-[#1a2a3a] rounded p-3 mb-5 text-[11px] text-[#6b7280] font-mono leading-relaxed">
                <div className="text-[#5af5c8] mb-1">Cara dapat credentials:</div>
                <div>1. Buka console.cloud.google.com</div>
                <div>2. APIs &amp; Services → Credentials</div>
                <div>3. OAuth 2.0 Client IDs → pilih/buat &quot;Web application&quot;</div>
                <div>4. Tambah Authorized redirect URI:</div>
                <div className="text-[#c8f55a] ml-4 break-all mt-1">
                  {redirectUri || 'https://aksarastream.ddns.net/oauth-helper'}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Client ID</label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    placeholder="xxxx.apps.googleusercontent.com"
                    className="w-full bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-sm font-mono focus:border-[#c8f55a] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Client Secret</label>
                  <input
                    type="password"
                    value={clientSecret}
                    onChange={e => setClientSecret(e.target.value)}
                    placeholder="GOCSPX-..."
                    className="w-full bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-sm font-mono focus:border-[#c8f55a] outline-none"
                  />
                </div>
              </div>

              <button
                onClick={startOAuth}
                className="w-full mt-4 py-2.5 rounded bg-[#c8f55a] text-[#0a0c0f] text-sm font-bold font-mono hover:bg-[#b8e54a] transition-colors"
              >
                Authorize dengan Google →
              </button>
            </div>
          )}

          {/* Step 2: Exchange */}
          {step === 'exchange' && (
            <div className="bg-[#111318] border border-[#2a2e38] rounded-lg p-6">
              <div className="text-[10px] text-[#6b7280] uppercase tracking-widest font-mono mb-4">
                Tukar Authorization Code
              </div>

              <div className="bg-[#0a1a0a] border border-[#1a3a1a] rounded p-3 mb-5 text-[11px] text-[#5af5c8] font-mono">
                Google sudah kasih authorization code. Klik tombol di bawah untuk nukar jadi refresh token.
              </div>

              <div className="mb-4">
                <label className="text-[10px] text-[#6b7280] font-mono block mb-1">Authorization Code (dari Google)</label>
                <div className="bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-2 text-xs font-mono text-[#6b7280] break-all">
                  {authCode.slice(0, 40)}...
                </div>
              </div>

              <button
                onClick={exchangeCode}
                disabled={loading}
                className="w-full py-2.5 rounded bg-[#c8f55a] text-[#0a0c0f] text-sm font-bold font-mono hover:bg-[#b8e54a] transition-colors disabled:opacity-50"
              >
                {loading ? 'Menukar token...' : 'Exchange → Refresh Token'}
              </button>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 'done' && (
            <div className="bg-[#111318] border border-[#1a3a1a] rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-[#c8f55a]" />
                <div className="text-[10px] text-[#c8f55a] uppercase tracking-widest font-mono">
                  Refresh Token Berhasil
                </div>
              </div>

              <label className="text-[10px] text-[#6b7280] font-mono block mb-2">
                Refresh Token (copy dan simpan — hanya muncul sekali!)
              </label>
              <div className="bg-[#0a0c0f] border border-[#2a2e38] rounded px-3 py-3 text-xs font-mono text-[#e8e6e0] break-all mb-3">
                {refreshToken}
              </div>

              <button
                onClick={copyToken}
                className={`w-full py-2.5 rounded text-sm font-bold font-mono transition-colors mb-3
                  ${copied
                    ? 'bg-[#0a1a0a] border border-[#1a4a1a] text-[#5af5c8]'
                    : 'bg-[#c8f55a] text-[#0a0c0f] hover:bg-[#b8e54a]'
                  }`}
              >
                {copied ? '✓ Tersalin!' : 'Copy Refresh Token'}
              </button>

              <div className="bg-[#0d0f12] border border-[#2a2e38] rounded p-3 text-[11px] text-[#6b7280] font-mono mb-4">
                <div className="text-[#f5c85a] mb-1">Selanjutnya:</div>
                <div>1. Buka halaman /streams</div>
                <div>2. Tambah channel baru</div>
                <div>3. Paste refresh token ini di field yang tersedia</div>
              </div>

              <div className="flex gap-3">
                <a
                  href="/streams"
                  className="flex-1 py-2 rounded border border-[#c8f55a] text-[#c8f55a] text-xs font-mono text-center hover:bg-[#0a1a00] transition-colors"
                >
                  → Ke Halaman Streams
                </a>
                <button
                  onClick={reset}
                  className="flex-1 py-2 rounded border border-[#2a2e38] text-[#6b7280] text-xs font-mono hover:text-[#e8e6e0] transition-colors"
                >
                  Generate Token Lagi
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
