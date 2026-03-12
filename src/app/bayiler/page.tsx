'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, Suspense, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { 
  Search, 
  Loader2, 
  ChevronLeft, 
  ChevronRight,
  Users,
  Store,
  X,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatNumber, cn } from '@/lib/utils';
import type { Bayi, BayiApiResponse } from '@/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import toast from 'react-hot-toast';

async function fetchBayiler(search: string, page: number) {
  const params = new URLSearchParams();
  params.set('page', page.toString());
  params.set('limit', '20');
  if (search) params.set('search', search);

  const res = await fetch(`/api/bayi?${params}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Bir hata oluştu');
  }
  return res.json();
}

function BayilerSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mt-2" />
        </div>

        <div className="card mb-6">
          <div className="p-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="h-10 w-20 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Bayi Kodu</th>
                  <th>Bayi Adı</th>
                  <th>Territory</th>
                  <th>Kategori</th>
                  <th>Konum</th>
                  <th>Son Slot</th>
                  <th>Son Güncelleme</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...Array(10)].map((_, i) => (
                  <tr key={i}>
                    <td><div className="h-4 w-20 bg-gray-200 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-40 bg-gray-200 rounded animate-pulse" /></td>
                    <td><div className="h-5 w-16 bg-gray-200 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-24 bg-gray-200 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-20 bg-gray-200 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-12 bg-gray-200 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-20 bg-gray-200 rounded animate-pulse" /></td>
                    <td><div className="h-8 w-14 bg-gray-200 rounded animate-pulse" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function BayilerContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [page, setPage] = useState(1);
  
  const debouncedSearch = useDebounce(search, 500);

  const { data, isLoading, isFetching, isError, error } = useQuery<BayiApiResponse>({
    queryKey: ['bayiler', debouncedSearch, page],
    queryFn: () => fetchBayiler(debouncedSearch, page),
    enabled: status === 'authenticated',
    placeholderData: keepPreviousData,
  });

  const bayiler: Bayi[] = data?.bayiler || [];
  const totalPages = data?.pagination?.totalPages || 1;
  const total = data?.pagination?.total || 0;
  const targetYear = data?.targetYear;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Arama metni değiştiğinde sayfayı 1'e al
  // setState işlemini etkinin dışında, kullanıcı etkileşimine bağladık

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  useEffect(() => {
    if (isError) {
      toast.error(error?.message || 'Veri yüklenirken hata oluştu');
    }
  }, [isError, error]);

  if (status === 'loading' || (isLoading && !data)) {
    return <BayilerSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Bayiler</h1>
          <p className="text-foreground-light mt-1">{total} bayi bulundu</p>
        </div>

        <div className="card mb-6">
          <form onSubmit={handleSearch} className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Bayi adı veya kod ile ara..."
                  className="input pl-10 pr-10"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setPage(1); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button type="submit" className="btn btn-primary">
                {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ara'}
              </button>
            </div>
          </form>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Bayi Kodu</th>
                  <th>Bayi Adı</th>
                  <th>Territory</th>
                  <th>Kategori</th>
                  <th>Konum</th>
                  <th>Son Slot</th>
                  <th>Son Güncelleme</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bayiler.map((bayi, index) => (
                  <tr 
                    key={bayi.CustomerCode}
                    className="animate-fadeIn"
                    style={{ animationDelay: `${index * 20}ms` }}
                  >
                    <td>
                      <span className="font-mono text-sm">{bayi.CustomerCode}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{bayi.CustomerName}</span>
                        {bayi.Has2026 === 0 && (
                          <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-semibold uppercase tracking-wide">
                            {(targetYear ?? 2026)} YOK
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
                        {bayi.Territory}
                      </span>
                    </td>
                    <td className="text-foreground-light">
                      {bayi.SubTradeCategoryDescription || bayi.TradeCategoryDescription}
                    </td>
                    <td className="text-foreground-light">
                      {bayi.AddressLevel2Description}
                    </td>
                    <td>
                      <span className={cn(
                        'font-semibold',
                        (bayi.SonSlot ?? 0) > 0 ? 'text-green-600' : 'text-gray-400'
                      )}>
                        {formatNumber(bayi.SonSlot)}
                      </span>
                    </td>
                    <td className="text-foreground-light">
                      {bayi.SonGuncelleme ? formatDate(bayi.SonGuncelleme) : '-'}
                    </td>
                    <td>
                      <Link 
                        href={`/bayiler/${bayi.CustomerCode}`}
                        className="btn btn-secondary text-sm py-1.5 px-3"
                      >
                        Detay
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bayiler.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-foreground-light">Bayi bulunamadı</p>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 border-t border-border">
              <p className="text-sm text-foreground-light">
                Sayfa {page} / {totalPages} ({total} bayi)
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="btn btn-secondary py-1.5 px-2 disabled:opacity-50"
                  title="İlk sayfa"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary py-1.5 px-3 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                {page > 2 && (
                  <span className="px-2 text-foreground-light">...</span>
                )}
                
                {page > 1 && (
                  <button
                    onClick={() => setPage(page - 1)}
                    className="btn btn-secondary py-1.5 px-3"
                  >
                    {page - 1}
                  </button>
                )}
                
                <button
                  className="btn btn-primary py-1.5 px-3"
                >
                  {page}
                </button>
                
                {page < totalPages && (
                  <button
                    onClick={() => setPage(page + 1)}
                    className="btn btn-secondary py-1.5 px-3"
                  >
                    {page + 1}
                  </button>
                )}
                
                {page < totalPages - 1 && (
                  <span className="px-2 text-foreground-light">...</span>
                )}
                
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-secondary py-1.5 px-3 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="btn btn-secondary py-1.5 px-2 disabled:opacity-50"
                  title="Son sayfa"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function BayilerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    }>
      <BayilerContent />
    </Suspense>
  );
}
