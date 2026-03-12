'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/Navbar';
import type { DashboardApiResponse } from '@/types';
import { Loader2, TrendingUp, Users, Clock } from 'lucide-react';
import { formatDate, formatNumber } from '@/lib/utils';

async function fetchDashboard(): Promise<DashboardApiResponse> {
  const res = await fetch('/api/dashboard', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Dashboard verileri yüklenemedi');
  }
  return res.json();
}

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    enabled: status === 'authenticated',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card p-8 text-center text-red-600">
            {(error as Error).message}
          </div>
        </main>
      </div>
    );
  }

  const stats = data?.stats;
  const recent = data?.recentUpdates ?? [];
  const cards = data?.cards ?? [];
  const beforeCards = data?.cardsBefore ?? [];
  const baselineYear = data?.baselineYear;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-foreground-light mt-1">Genel durum ve son güncellemeler</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-4 bg-white border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-blue-600" />
              <p className="text-sm text-foreground-light">Toplam Bayi</p>
            </div>
            <p className="text-2xl font-semibold mt-2">{formatNumber(stats?.totalBayi ?? 0)}</p>
          </div>
          <div className="p-4 bg-white border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <p className="text-sm text-foreground-light">Kayıtlı Bayi</p>
            </div>
            <p className="text-2xl font-semibold mt-2">{formatNumber(stats?.kayitliBayi ?? 0)}</p>
          </div>
          <div className="p-4 bg-white border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <p className="text-sm text-foreground-light">Son Güncelleme</p>
            </div>
            <p className="text-2xl font-semibold mt-2">
              {stats?.sonGuncelleme ? formatDate(stats.sonGuncelleme) : '-'}
            </p>
          </div>
          <div className="p-4 bg-white border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <p className="text-sm text-foreground-light">Ortalama Slot</p>
            </div>
            <p className="text-2xl font-semibold mt-2">
              {formatNumber(Math.round((stats?.ortalamaSlot ?? 0) * 100) / 100)}
            </p>
          </div>
        </div>

        {cards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {cards.map((c) => {
              const before = beforeCards.find(b => b.label === c.label)?.value ?? null;
              const delta = c.value !== null && before !== null ? c.value - before : null;
              return (
              <div key={c.label} className="p-4 bg-white border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm text-foreground-light">{c.label}</p>
                </div>
                <p className="text-2xl font-semibold mt-2">
                  {c.value !== null && c.value !== undefined
                    ? formatNumber(
                        Math.round(c.value * Math.pow(10, c.decimals ?? 2)) /
                          Math.pow(10, c.decimals ?? 2)
                      ) + (c.value > 1 && (c.decimals ?? 2) >= 0 ? '' : '')
                    : '-'}
                </p>
                {(before !== null || delta !== null) && (
                  <p className="text-xs text-foreground-light mt-1">
                    {baselineYear ? `Önce ${baselineYear}: ` : 'Önce: '}
                    {before !== null && before !== undefined
                      ? formatNumber(
                          Math.round(before * Math.pow(10, c.decimals ?? 2)) /
                            Math.pow(10, c.decimals ?? 2)
                        )
                      : '-'}
                    {delta !== null && (
                      <> · Δ {formatNumber(
                        Math.round(delta * Math.pow(10, c.decimals ?? 2)) /
                        Math.pow(10, c.decimals ?? 2)
                      )}</>
                    )}
                  </p>
                )}
              </div>
            )})}
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Son Güncellemeler</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Bayi Kodu</th>
                  <th>Bayi Adı</th>
                  <th>Territory</th>
                  <th>Tarih</th>
                  <th>Toplam Slot</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={`${r.CustomerCode}-${r.Date}`}>
                    <td className="font-mono text-sm">{r.CustomerCode}</td>
                    <td>{r.CustomerName}</td>
                    <td>
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                        {r.Territory}
                      </span>
                    </td>
                    <td className="text-foreground-light">{formatDate(r.Date)}</td>
                    <td className="font-semibold">{formatNumber(r.SlotSayisi)}</td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-foreground-light">
                      Kayıt bulunamadı
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
