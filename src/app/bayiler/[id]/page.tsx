'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { 
  Loader2, 
  ArrowLeft,
  Plus,
  Edit2,
  TrendingUp,
  History,
  X,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatNumber, slotColumns, cn } from '@/lib/utils';
import type { BayiDetail, BayiDetailData } from '@/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine
} from 'recharts';
import toast from 'react-hot-toast';

async function fetchBayiDetail(id: string) {
  const res = await fetch(`/api/bayi/${id}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Bayi bulunamadı');
  }
  return res.json();
}

export default function BayiDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ column: string; value: number } | null>(null);

  const { data, isLoading, error } = useQuery<BayiDetail>({
    queryKey: ['bayi-detail', params.id],
    queryFn: () => fetchBayiDetail(params.id as string),
    enabled: !!session && !!params.id,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const chartData = useMemo(() => {
    const h = data?.history;
    return h?.slice(0, 12).reverse().map((item: BayiDetailData) => ({
      date: formatDate(item.Date || ''),
      slot: (item['Total _Pm _Slot _Sayısı'] as number) || 0,
      endustri: (item['Endüstri _Slot'] as number) || 0,
      top3: (item['Total _Top3 _Sku _Slot _Sayısı'] as number) || 0,
    })) || [];
  }, [data?.history]);

  const updateMutation = useMutation({
    mutationFn: async ({ column, newValue }: { column: string; newValue: number }) => {
      if (!data?.currentData) throw new Error('Veri yok');
      
      const res = await fetch('/api/slot', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: data.currentData.aa,
          customerCode: params.id,
          slotColumn: column,
          newValue,
          date: data.currentData.Date
        })
      });

      if (!res.ok) throw new Error('Güncelleme başarısız');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bayi-detail', params.id] });
      toast.success('Slot başarıyla güncellendi');
      setEditingSlot(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Güncelleme sırasında hata oluştu');
    }
  });

  const handleSlotUpdate = async (column: string, newValue: number) => {
    updateMutation.mutate({ column, newValue });
  };

  const { data: cardDefs } = useQuery<Array<{ label: string; numeratorKey?: string; denominatorKey?: string; numeratorKeys?: string[]; denominatorKeys?: string[]; multiplier?: number; decimals?: number; active?: boolean }>>({
    queryKey: ['admin-cards-defs'],
    queryFn: async () => {
      const r = await fetch('/api/admin/dashboard-cards', { cache: 'no-store' });
      if (!r.ok) throw new Error('Kartlar yüklenemedi');
      return r.json();
    },
    enabled: !!session,
  });

  const { data: baselineResp } = useQuery<{ baseline: BayiDetailData | null; year: number }>({
    queryKey: ['bayi-baseline', params.id],
    queryFn: async () => {
      const r = await fetch(`/api/bayi/${params.id}/baseline`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Baz yüklenemedi');
      return r.json();
    },
    enabled: !!session && !!params.id,
  });

  const perBayiCards = useMemo(() => {
    if (!data?.currentData || !cardDefs) return [];
    const toArr = (v?: string | string[]) => Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(x => x.trim()).filter(Boolean) : []);
    const getVal = (k: string) => {
      const val = (data?.currentData as BayiDetailData | undefined)?.[k as keyof BayiDetailData];
      const num = typeof val === 'number' ? val : Number(val);
      return Number.isFinite(num) ? num : 0;
    };
    return cardDefs
      .filter(c => c.active !== false)
      .map(c => {
        const nks = toArr(c.numeratorKeys || c.numeratorKey);
        const dks = toArr(c.denominatorKeys || c.denominatorKey);
        const num = nks.reduce((s, k) => s + getVal(k), 0);
        const den = dks.reduce((s, k) => s + getVal(k), 0);
        const value = den !== 0 ? (num / den) * (c.multiplier ?? 1) : null;
        return { label: c.label, value, decimals: c.decimals };
      });
  }, [data?.currentData, cardDefs]);

  const perBayiBeforeCards = useMemo(() => {
    if (!baselineResp?.baseline || !cardDefs) return [];
    const base = baselineResp.baseline;
    const toArr = (v?: string | string[]) => Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').map(x => x.trim()).filter(Boolean) : []);
    const getVal = (k: string) => {
      const val = (base as BayiDetailData | undefined)?.[k as keyof BayiDetailData];
      const num = typeof val === 'number' ? val : Number(val);
      return Number.isFinite(num) ? num : 0;
    };
    return cardDefs
      .filter(c => c.active !== false)
      .map(c => {
        const nks = toArr(c.numeratorKeys || c.numeratorKey);
        const dks = toArr(c.denominatorKeys || c.denominatorKey);
        const num = nks.reduce((s, k) => s + getVal(k), 0);
        const den = dks.reduce((s, k) => s + getVal(k), 0);
        const value = den !== 0 ? (num / den) * (c.multiplier ?? 1) : null;
        return { label: c.label, value, decimals: c.decimals };
      });
  }, [baselineResp, cardDefs]);

  const baselineX = useMemo(() => {
    const d = baselineResp?.baseline?.Date;
    return typeof d === 'string' && d ? formatDate(d) : null;
  }, [baselineResp?.baseline?.Date]);

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 mb-4">{error.message}</p>
            <Link href="/bayiler" className="btn btn-primary">
              <ArrowLeft className="w-4 h-4" /> Bayi Listesine Dön
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const bayi = data?.bayi;
  const currentData = data?.currentData;
  const history = data?.history;
  const changes = data?.changes;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link href="/bayiler" className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Bayi Listesine Dön
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="card p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div>
                  <h1 className="text-xl font-bold text-foreground">{bayi?.CustomerName}</h1>
                  <p className="text-foreground-light mt-1">Kod: {bayi?.CustomerCode}</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowAddModal(true)}
                    className="btn btn-primary text-sm"
                  >
                    <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Yeni Slot Ekle</span>
                  </button>
                </div>
              </div>

              {perBayiCards.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                  {perBayiCards.map(c => (
                    <div key={c.label} className="p-3 sm:p-4 bg-white border border-border rounded-xl">
                      <p className="text-xs text-foreground-light">{c.label}</p>
                      <p className="text-lg font-semibold mt-1">
                        {c.value !== null && c.value !== undefined
                          ? formatNumber(
                              Math.round((c.value) * Math.pow(10, c.decimals ?? 2)) /
                              Math.pow(10, c.decimals ?? 2)
                            )
                          : '-'}
                      </p>
                      {perBayiBeforeCards.length > 0 && (
                        (() => {
                          const b = perBayiBeforeCards.find(x => x.label === c.label)?.value ?? null;
                          const d = c.value !== null && b !== null ? c.value - b : null;
                          return (
                            <p className="text-xs text-foreground-light mt-1">
                              Önce {baselineResp?.year ?? 2025}: {b !== null ? formatNumber(Math.round(b * Math.pow(10, c.decimals ?? 2)) / Math.pow(10, c.decimals ?? 2)) : '-'}
                              {d !== null && <> · Δ {formatNumber(Math.round(d * Math.pow(10, c.decimals ?? 2)) / Math.pow(10, c.decimals ?? 2))}</>}
                            </p>
                          );
                        })()
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-foreground-light mb-1">Territory</p>
                  <p className="font-semibold text-sm">{bayi?.Territory}</p>
                </div>
                <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-foreground-light mb-1">Bölge</p>
                  <p className="font-semibold text-sm">{typeof currentData?.Region === 'string' ? currentData.Region : '-'}</p>
                </div>
                <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-foreground-light mb-1">Zone</p>
                  <p className="font-semibold text-sm">{typeof currentData?.Zone === 'string' ? currentData.Zone : '-'}</p>
                </div>
                <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-foreground-light mb-1">Son Güncelleme</p>
                  <p className="font-semibold text-sm">{typeof currentData?.Date === 'string' ? formatDate(currentData.Date) : '-'}</p>
                </div>
              </div>
            </div>

            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Slot Verileri</h2>
              
              {currentData ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {slotColumns.map((col) => {
                    const value = currentData[col.key];
                    const numericValue = typeof value === 'number' ? value : Number(value) || 0;
                    const isEditing = editingSlot?.column === col.key;
                    
                    return (
                      <div 
                        key={col.key}
                        className="p-3 border border-border rounded-lg hover:border-blue-300 transition-colors"
                      >
                        <p className="text-xs text-foreground-light mb-1">{col.label}</p>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              defaultValue={numericValue}
                              className="input py-1 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSlotUpdate(col.key, parseFloat((e.target as HTMLInputElement).value) || 0);
                                }
                                if (e.key === 'Escape') setEditingSlot(null);
                              }}
                            />
                            <button
                              onClick={() => setEditingSlot(null)}
                              className="p-1 text-red-500"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-lg">{formatNumber(numericValue)}</span>
                            <button
                              onClick={() => setEditingSlot({ column: col.key, value: numericValue })}
                              className="p-1 text-gray-400 hover:text-blue-600"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-foreground-light mb-4">Bu bayi için henüz slot verisi yok</p>
                  <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                    <Plus className="w-4 h-4" /> İlk Slot Verisini Ekle
                  </button>
                </div>
              )}
            </div>

            <div className="card p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Slot Trend Grafiği</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px'
                      }}
                    />
                    {baselineX && (
                      <ReferenceLine
                        x={baselineX}
                        stroke="#F59E0B"
                        strokeDasharray="3 3"
                      />
                    )}
                    <Line type="monotone" dataKey="slot" name="Toplam Slot" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="endustri" name="Endüstri" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="top3" name="Top3 SKU" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '10px' }}
                      formatter={(value) => <span className="text-sm text-foreground-light">{value}</span>}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <History className="w-5 h-5" />
                Değişim Geçmişi
              </h2>
              
              {changes && changes.length > 0 ? (
                <div className="space-y-3 max-h-64 sm:max-h-96 overflow-y-auto">
                  {changes.map((change) => (
                    <div key={change.ID} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-medium text-blue-600">{change.SlotColumn}</span>
                        <span className="text-xs text-foreground-light">{formatDate(change.ChangedAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-red-500">{change.OldValue || 0}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-green-500 font-medium">{change.NewValue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-foreground-light text-sm">Henüz değişiklik kaydı yok</p>
              )}
            </div>

            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Tarihçe</h2>
              
              {history && history.length > 0 ? (
                <div className="space-y-2 max-h-64 sm:max-h-80 overflow-y-auto">
                  {history.map((h, i) => (
                    <div 
                      key={i}
                      className={cn(
                        'p-3 rounded-lg border',
                        i === 0 ? 'border-blue-200 bg-blue-50' : 'border-border'
                      )}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-sm">{formatDate(typeof h.Date === 'string' ? h.Date : '')}</span>
                        <span className="font-semibold text-blue-600">
                          {formatNumber(typeof h['Total _Pm _Slot _Sayısı'] === 'number' ? h['Total _Pm _Slot _Sayısı'] as number : Number(h['Total _Pm _Slot _Sayısı']) || 0)} slot
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-foreground-light text-sm">Tarihçe verisi yok</p>
              )}
            </div>
          </div>
        </div>
      </main>

      {showAddModal && (
        <AddSlotModal 
          customerCode={params.id as string}
          territory={bayi?.TerritoryCode || ''}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            queryClient.invalidateQueries({ queryKey: ['bayi-detail', params.id] });
          }}
        />
      )}
    </div>
  );
}

function AddSlotModal({ 
  customerCode, 
  territory, 
  onClose, 
  onSuccess 
}: { 
  customerCode: string; 
  territory: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    ...Object.fromEntries(slotColumns.map(c => [c.key], 0))
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerCode,
          territory,
          date: formData.date,
          ...formData
        })
      });

      if (!res.ok) throw new Error('Ekleme başarısız');

      toast.success('Slot başarıyla eklendi');
      onSuccess();
    } catch {
      toast.error('Ekleme sırasında hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-semibold">Yeni Slot Ekle</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tarih</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {slotColumns.map((col) => (
              <div key={col.key}>
                <label className="block text-xs text-foreground-light mb-1">{col.label}</label>
                <input
                  type="number"
                  value={formData[col.key as keyof typeof formData]}
                  onChange={(e) => setFormData({ ...formData, [col.key]: parseFloat(e.target.value) || 0 })}
                  className="input py-2 text-sm"
                  min="0"
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              İptal
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
