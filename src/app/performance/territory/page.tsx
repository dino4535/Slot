'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/Navbar';
import type { TerritoryPerformanceApiResponse, TerritoryPerformanceRow } from '@/types';
import { Loader2, TrendingUp, Search } from 'lucide-react';
import { formatDate, formatNumber, cn } from '@/lib/utils';
import Link from 'next/link';

async function fetchTerritoryPerformance(params: {
  search: string;
  page: number;
  limit: number;
  card: string;
  territoryCode: string;
}): Promise<TerritoryPerformanceApiResponse> {
  const sp = new URLSearchParams();
  sp.set('page', String(params.page));
  sp.set('limit', String(params.limit));
  if (params.search) sp.set('search', params.search);
  if (params.card) sp.set('card', params.card);
  if (params.territoryCode) sp.set('territoryCode', params.territoryCode);
  const res = await fetch(`/api/performance/territory?${sp.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Performans verileri yüklenemedi');
  }
  return res.json();
}

export default function TerritoryPerformancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === 'admin';
  const userTerritoryCodes = ((session?.user as { territoryCodes?: string[] } | undefined)?.territoryCodes ?? []).filter(Boolean);
  const canSelectTerritory = isAdmin || userTerritoryCodes.length > 1;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [selectedCard, setSelectedCard] = useState('');
  const [selectedTerritory, setSelectedTerritory] = useState('');

  const { data, isLoading, isError, error } = useQuery<TerritoryPerformanceApiResponse>({
    queryKey: ['performance-territory', search, page, limit, selectedCard, selectedTerritory],
    queryFn: () => fetchTerritoryPerformance({ search, page, limit, card: selectedCard, territoryCode: selectedTerritory }),
    enabled: status === 'authenticated',
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const selectedLabel = data?.selectedCard?.label ?? '';

  useEffect(() => {
    if (!selectedLabel) return;
    if (!selectedCard) setTimeout(() => setSelectedCard(selectedLabel), 0);
  }, [selectedLabel, selectedCard]);

  const rows: TerritoryPerformanceRow[] = data?.rows ?? [];
  const territories = data?.territories ?? [];
  const baselineYear = data?.baselineYear;
  const decimals = data?.selectedCard?.decimals ?? 2;
  const pagination = data?.pagination;

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Performans</h1>
            <p className="text-foreground-light mt-1">
              Territory {baselineYear} → Güncel (Δ)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <Link href="/performance" className="btn btn-secondary">Bayi</Link>
          <Link href="/performance/territory" className="btn btn-primary">Territory</Link>
        </div>

        <div className="card mb-6">
          <div className="p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Territory adı veya kod ile ara..."
                className="input pl-10"
              />
            </div>
            <select
              value={selectedCard}
              onChange={(e) => { setSelectedCard(e.target.value); setPage(1); }}
              className="input"
            >
              {(data?.cardLabels ?? []).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <select
              value={selectedTerritory}
              onChange={(e) => { setSelectedTerritory(e.target.value); setPage(1); }}
              className={cn('input', !canSelectTerritory && 'opacity-60')}
              disabled={!canSelectTerritory}
            >
              <option value="">Tüm Territory</option>
              {territories.map(t => (
                <option key={t.TerritoryCode} value={t.TerritoryCode}>
                  {t.Territory}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-white border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-gray-600" />
              <p className="text-sm text-foreground-light">Before ({baselineYear})</p>
            </div>
            <p className="text-2xl font-semibold mt-2">
              {data?.summary?.beforeValue !== null && data?.summary?.beforeValue !== undefined
                ? formatNumber(Math.round(data.summary.beforeValue * Math.pow(10, decimals)) / Math.pow(10, decimals))
                : '-'}
            </p>
          </div>
          <div className="p-4 bg-white border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <p className="text-sm text-foreground-light">After (Güncel)</p>
            </div>
            <p className="text-2xl font-semibold mt-2">
              {data?.summary?.afterValue !== null && data?.summary?.afterValue !== undefined
                ? formatNumber(Math.round(data.summary.afterValue * Math.pow(10, decimals)) / Math.pow(10, decimals))
                : '-'}
            </p>
          </div>
          <div className="p-4 bg-white border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <p className="text-sm text-foreground-light">Δ</p>
            </div>
            <p className="text-2xl font-semibold mt-2">
              {data?.summary?.delta !== null && data?.summary?.delta !== undefined
                ? formatNumber(Math.round(data.summary.delta * Math.pow(10, decimals)) / Math.pow(10, decimals))
                : '-'}
            </p>
          </div>
          <div className="p-4 bg-white border border-border rounded-xl">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <p className="text-sm text-foreground-light">Eksikler</p>
            </div>
            <p className="text-sm mt-2 text-foreground-light">
              Baz yok: <span className="font-semibold text-foreground">{formatNumber(data?.summary?.missingBaseline ?? 0)}</span>
              {' · '}
              Güncel yok: <span className="font-semibold text-foreground">{formatNumber(data?.summary?.missingAfter ?? 0)}</span>
            </p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Territory Bazlı</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Territory</th>
                  <th>Code</th>
                  <th>Bayi</th>
                  <th>Baz Yok</th>
                  <th>Güncel Yok</th>
                  <th>{baselineYear} Tarih</th>
                  <th>Güncel Tarih</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.TerritoryCode}>
                    <td className="font-medium">{r.Territory}</td>
                    <td className="text-foreground-light font-mono">{r.TerritoryCode}</td>
                    <td className="text-foreground-light">{formatNumber(r.TotalBayiler)}</td>
                    <td className="text-foreground-light">{formatNumber(r.MissingBaseline)}</td>
                    <td className="text-foreground-light">{formatNumber(r.MissingAfter)}</td>
                    <td className="text-foreground-light">{r.BeforeDate ? formatDate(r.BeforeDate) : '-'}</td>
                    <td className="text-foreground-light">{r.AfterDate ? formatDate(r.AfterDate) : '-'}</td>
                    <td className="font-semibold">
                      {r.BeforeValue !== null ? formatNumber(Math.round(r.BeforeValue * Math.pow(10, decimals)) / Math.pow(10, decimals)) : '-'}
                    </td>
                    <td className="font-semibold">
                      {r.AfterValue !== null ? formatNumber(Math.round(r.AfterValue * Math.pow(10, decimals)) / Math.pow(10, decimals)) : '-'}
                    </td>
                    <td className={cn('font-semibold', (r.Delta ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {r.Delta !== null ? formatNumber(Math.round(r.Delta * Math.pow(10, decimals)) / Math.pow(10, decimals)) : '-'}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-foreground-light">
                      Kayıt bulunamadı
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border">
              <p className="text-sm text-foreground-light">
                Sayfa {pagination.page} / {pagination.totalPages} ({pagination.total} territory)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={pagination.page === 1}
                  className="btn btn-secondary py-1.5 px-3 disabled:opacity-50"
                >
                  Önceki
                </button>
                <button
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page === pagination.totalPages}
                  className="btn btn-secondary py-1.5 px-3 disabled:opacity-50"
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
