'use client';

import { signIn } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Mail } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const codeText = useMemo(() => {
    const lines = [
      'const SYSTEM = "SlotTakip";',
      'type Session = { userId: string; role: "admin" | "user" };',
      '',
      'async function authenticate(identifier: string, password: string) {',
      '  return { ok: true, token: "****" };',
      '}',
      '',
      'async function routeToDashboard() {',
      '  return "/dashboard";',
      '}',
      '',
      'export async function main() {',
      '  const env = process.env.NODE_ENV;',
      '  if (env === "production") return routeToDashboard();',
      '  return routeToDashboard();',
      '}',
    ];

    const out: string[] = [];
    for (let i = 0; i < 60; i++) {
      const l = lines[i % lines.length];
      out.push(l === '' ? '' : l);
    }
    return out.join('\n');
  }, []);

  useEffect(() => {
    if (!success) return;

    setCountdown(5);
    const startedAt = Date.now();

    const interval = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      const left = 5 - elapsedSec;
      setCountdown(left > 0 ? left : 0);
    }, 250);

    const timeout = setTimeout(() => {
      router.push('/dashboard');
    }, 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [success, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const identifier = (email || '').trim();
      const isEmail = identifier.includes('@');
      const result = await signIn('credentials', {
        email: isEmail ? identifier : undefined,
        territoryCode: !isEmail ? identifier : undefined,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === 'CredentialsSignin') {
          setError('Giriş başarısız. Kullanıcı pasif olabilir veya şifre yanlış olabilir.');
        } else {
          setError(result.error);
        }
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 login-grid" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-44 -right-44 w-[420px] h-[420px] bg-blue-500/20 rounded-full blur-3xl animate-blob-1" />
        <div className="absolute -bottom-44 -left-44 w-[420px] h-[420px] bg-indigo-500/20 rounded-full blur-3xl animate-blob-2" />
        <div className="absolute top-[18%] left-[14%] w-[320px] h-[320px] bg-sky-400/10 rounded-full blur-3xl animate-blob-3" />
        <div className="absolute bottom-[12%] right-[10%] w-[280px] h-[280px] bg-cyan-300/10 rounded-full blur-3xl animate-blob-1" />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={success ? 'login-code login-code-strong' : 'login-code'}>
          <div className="login-code-inner">{codeText}{'\n'}{codeText}</div>
        </div>
      </div>
      
      <div className="relative w-full max-w-md">
        {success ? (
          <div className="card login-card p-8 animate-fadeIn shadow-lg shadow-black/25">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-2xl mb-4">
                <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug">
                Takip Eden değil Standartların Belirlendiği Yerdesiniz
              </h1>

              <div className="mt-4 flex items-center justify-center">
                <div className="powered-chip">
                  <span className="powered-chip-text">Powered By Oğuz EMÜL</span>
                </div>
              </div>

              <div className="mt-6 text-sm text-foreground-light">
                {countdown} sn sonra anasayfaya yönlendiriliyorsunuz...
              </div>
            </div>
          </div>
        ) : (
          <div className="card login-card p-8 animate-fadeIn shadow-lg shadow-black/20">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-2xl mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-foreground">Slot Takip</h1>
              <p className="text-foreground-light text-sm mt-1">Bayi Yönetim Sistemi</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground-light mb-1.5">
                  E-posta veya Territory Kodu
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input pl-10"
                    placeholder="ornek@domain.com veya TERR021925"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground-light mb-1.5">
                  Şifre
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pl-10"
                    placeholder="Şifrenizi girin"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Giriş yapılıyor...
                  </>
                ) : (
                  'Geleceğe Katıl'
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-border text-center">
              <p className="text-sm text-foreground-light">
                Erişim için yetkili e-posta adresinizi veya<br />
                territory kodunuzu kullanın
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
