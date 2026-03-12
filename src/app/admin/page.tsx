'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { 
  Loader2, 
  Save, 
  Plus, 
  Trash2, 
  ArrowLeft,
  GripVertical,
  RefreshCw,
  Search,
  Upload
} from 'lucide-react';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface Column {
  key: string;
  label: string;
  order: number;
}

type CardDef = {
  label: string;
  numeratorKey?: string;
  denominatorKey?: string;
  numeratorKeys?: string[];
  denominatorKeys?: string[];
  multiplier?: number;
  decimals?: number;
  active?: boolean;
};

type PerformanceYears = { baselineYear: number; targetYear: number };

type AdminUser = {
  ID: number;
  TerritoryCode: string | null;
  TerritoryName: string | null;
  TerritoryCodes?: string[];
  Email: string | null;
  Role: string | null;
  IsActive: number;
  LastLogin: string | null;
};

type AdminUsersApiResponse = { users: AdminUser[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

type TerritoryOption = { TerritoryCode: string; Territory: string };

type SlotDataImportResult = {
  success: true;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

async function fetchColumns() {
  const res = await fetch('/api/admin/columns?_=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Kolonlar yüklenemedi');
  const data: unknown = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Hiç kolon bulunamadı. "DB\'den Çek" butonuna basın.');
  }
  return data as Column[];
}

async function fetchCards() {
  const res = await fetch('/api/admin/dashboard-cards?_=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Dashboard kartları yüklenemedi');
  return res.json() as Promise<CardDef[]>;
}

async function fetchPerformanceYears() {
  const res = await fetch('/api/admin/performance-years?_=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Yıl ayarları yüklenemedi');
  return res.json() as Promise<PerformanceYears>;
}

async function savePerformanceYears(years: PerformanceYears) {
  const res = await fetch('/api/admin/performance-years', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(years),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Kaydetme hatası');
  }
  return res.json();
}

async function saveColumns(columns: Column[]) {
  const columnsWithOrder = columns.map((c, i) => ({ ...c, order: i }));
  const res = await fetch('/api/admin/columns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columns: columnsWithOrder }),
  });
  
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Kaydetme hatası');
  }
  return res.json();
}

async function saveCards(cards: CardDef[]) {
  // normalize comma separated to arrays
  const normalized = cards.map(c => {
    const toArr = (v?: string | string[]) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') return v.split(',').map(x => x.trim()).filter(Boolean);
      return [];
    };
    const numeratorKeys = c.numeratorKeys && c.numeratorKeys.length ? c.numeratorKeys : toArr(c.numeratorKey);
    const denominatorKeys = c.denominatorKeys && c.denominatorKeys.length ? c.denominatorKeys : toArr(c.denominatorKey);
    return { ...c, numeratorKeys, denominatorKeys };
  });
  const res = await fetch('/api/admin/dashboard-cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards: normalized }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Kaydetme hatası');
  }
  return res.json();
}

async function syncFromDb() {
  const res = await fetch('/api/admin/sync-from-db');
  if (!res.ok) throw new Error('DB\'den çekme hatası');
  return res.json();
}

async function fetchTerritories() {
  const res = await fetch('/api/admin/territories?_=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Territory listesi yüklenemedi');
  return res.json() as Promise<TerritoryOption[]>;
}

async function fetchUsers(search: string, page: number, limit: number) {
  const sp = new URLSearchParams();
  sp.set('page', String(page));
  sp.set('limit', String(limit));
  if (search) sp.set('search', search);
  sp.set('_', String(Date.now()));
  const res = await fetch(`/api/admin/users?${sp.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Kullanıcılar yüklenemedi');
  }
  return res.json() as Promise<AdminUsersApiResponse>;
}

async function createUser(body: {
  email: string;
  fullName?: string;
  password: string;
  role: string;
  isActive?: boolean;
}) {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Kullanıcı oluşturma hatası');
  }
  return res.json();
}

async function importSlotData(file: File): Promise<SlotDataImportResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/admin/slot-data/import', { method: 'POST', body: form });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || text || 'Excel yükleme hatası';
    throw new Error(msg);
  }
  return data as SlotDataImportResult;
}

async function updateUser(id: number, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Kullanıcı güncelleme hatası');
  }
  return res.json();
}

async function deactivateUser(id: number) {
  const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Kullanıcı pasifleştirme hatası');
  }
  return res.json();
}

function SortableItem({ 
  id, 
  col, 
  index, 
  onDelete, 
  onUpdate 
}: { 
  id: string; 
  col: Column; 
  index: number;
  onDelete: () => void;
  onUpdate: (key: string, label: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [editKey, setEditKey] = useState(col.key);
  const [editLabel, setEditLabel] = useState(col.label);

  const handleBlur = () => {
    onUpdate(editKey, editLabel);
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="p-4 flex items-center gap-4 bg-white border-b border-border hover:bg-gray-50"
    >
      <button
        {...attributes}
        {...listeners}
        className="p-2 hover:bg-gray-100 rounded cursor-grab"
      >
        <GripVertical className="w-5 h-5 text-gray-400" />
      </button>
      <span className="w-8 text-sm text-gray-500">{index + 1}</span>
      <div className="flex-1 grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-500">Anahtar</label>
          <input
            type="text"
            value={editKey}
            onChange={(e) => setEditKey(e.target.value)}
            onBlur={handleBlur}
            className="input py-1 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">Görünen Ad</label>
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleBlur}
            className="input py-1 text-sm"
          />
        </div>
      </div>
      <button
        onClick={onDelete}
        className="p-2 hover:bg-red-100 text-red-600 rounded"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function AdminColumnsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [newColumn, setNewColumn] = useState({ key: '', label: '' });
  const [localColumns, setLocalColumns] = useState<Column[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cards, setCards] = useState<CardDef[]>([]);
  const [newCard, setNewCard] = useState<CardDef>({ label: '', numeratorKey: '', denominatorKey: '', multiplier: 100, decimals: 2, active: true });
  const [years, setYears] = useState<PerformanceYears>({ baselineYear: 2025, targetYear: 2026 });
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [localUsers, setLocalUsers] = useState<AdminUser[]>([]);
  const [passwordEdits, setPasswordEdits] = useState<Record<number, string>>({});
  const [activeTab, setActiveTab] = useState<'users' | 'years' | 'cards' | 'columns' | 'import'>('users');
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'user',
    isActive: true,
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<SlotDataImportResult | null>(null);

  const { data: columns, isLoading, error } = useQuery<Column[]>({
    queryKey: ['admin-columns', refreshKey],
    queryFn: fetchColumns,
    retry: false
  });

  const { data: cardsData } = useQuery<CardDef[]>({
    queryKey: ['admin-cards', refreshKey],
    queryFn: fetchCards,
    retry: false
  });

  const { data: yearsData } = useQuery<PerformanceYears>({
    queryKey: ['admin-performance-years', refreshKey],
    queryFn: fetchPerformanceYears,
    retry: false
  });

  const { data: territoriesData } = useQuery<TerritoryOption[]>({
    queryKey: ['admin-territories', refreshKey],
    queryFn: fetchTerritories,
    retry: false,
  });

  const { data: usersData, isLoading: usersLoading, error: usersError } = useQuery<AdminUsersApiResponse>({
    queryKey: ['admin-users', refreshKey, userSearch, userPage],
    queryFn: () => fetchUsers(userSearch, userPage, 50),
    retry: false,
  });

  useEffect(() => {
    if (!usersData?.users) return;
    setTimeout(() => {
      setLocalUsers(usersData.users);
    }, 0);
  }, [usersData?.users]);

  useEffect(() => {
    if (!cardsData) return;
    setTimeout(() => {
      setCards(cardsData);
    }, 0);
  }, [cardsData]);
  
  useEffect(() => {
    if (!columns) return;
    setTimeout(() => {
      setLocalColumns(columns);
    }, 0);
  }, [columns]);

  useEffect(() => {
    if (!yearsData) return;
    setTimeout(() => {
      setYears(yearsData);
    }, 0);
  }, [yearsData]);

  

  // localColumns ilk başarıyla yüklendiğinde onSuccess ile set edilir

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const saveMutation = useMutation({
    mutationFn: saveColumns,
    onSuccess: () => {
      toast.success('Kolon ayarları başarıyla kaydedildi!');
      queryClient.invalidateQueries({ queryKey: ['admin-columns'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Kaydetme hatası');
    }
  });

  const syncMutation = useMutation({
    mutationFn: syncFromDb,
    onSuccess: (data) => {
      setLocalColumns(data.columns);
      toast.success(`Veritabanından ${data.columns.length} kolon çekildi!`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'DB\'den çekme hatası');
    }
  });

  const saveCardsMutation = useMutation({
    mutationFn: saveCards,
    onSuccess: () => {
      toast.success('Dashboard kartları kaydedildi!');
      queryClient.invalidateQueries({ queryKey: ['admin-cards'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Kaydetme hatası');
    }
  });

  const saveYearsMutation = useMutation({
    mutationFn: savePerformanceYears,
    onSuccess: () => {
      toast.success('Yıl ayarları kaydedildi!');
      queryClient.invalidateQueries({ queryKey: ['admin-performance-years'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['bayiler'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Kaydetme hatası');
    }
  });

  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      toast.success('Kullanıcı oluşturuldu');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setNewUser({ fullName: '', email: '', password: '', role: 'user', isActive: true });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Kullanıcı oluşturma hatası');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => updateUser(id, body),
    onSuccess: () => {
      toast.success('Kullanıcı güncellendi');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Kullanıcı güncelleme hatası');
    },
  });

  const deactivateUserMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      toast.success('Kullanıcı pasifleştirildi');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Kullanıcı pasifleştirme hatası');
    },
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const handleSave = () => {
    saveMutation.mutate(localColumns);
  };

  const handleDelete = (index: number) => {
    const deletedCol = localColumns[index];
    const newCols = localColumns.filter((_, i) => i !== index);
    setLocalColumns(newCols);
    toast.success(`${deletedCol?.key} silindi - Kaydet butonuna bas!`);
  };

  const handleAddColumn = () => {
    if (!newColumn.key || !newColumn.label) {
      toast.error('Lütfen kolon anahtarı ve görünen ad girin');
      return;
    }
    
    const key = newColumn.key.replace(/\s+/g, '_').toUpperCase();
    
    if (localColumns.some(c => c.key === key)) {
      toast.error('Bu kolon zaten mevcut!');
      return;
    }
    
    const newCols = [...localColumns, { key, label: newColumn.label, order: localColumns.length }];
    setLocalColumns(newCols);
    setNewColumn({ key: '', label: '' });
    toast.success(`${key} eklendi - Kaydet butonuna bas!`);
    setRefreshKey(k => k + 1);
  };

  const handleUpdate = (index: number, key: string, label: string) => {
    const newColumns = [...localColumns];
    newColumns[index] = { ...newColumns[index], key, label };
    setLocalColumns(newColumns);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setLocalColumns((items) => {
        const oldIndex = items.findIndex((i) => i.key === active.id);
        const newIndex = items.findIndex((i) => i.key === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addCard = () => {
    if (!newCard.label || !newCard.numeratorKey || !newCard.denominatorKey) {
      toast.error('Lütfen kart bilgilerini doldurun');
      return;
    }
    setCards([...cards, newCard]);
    setNewCard({ label: '', numeratorKey: '', denominatorKey: '', multiplier: 100, decimals: 2, active: true });
  };

  const removeCard = (index: number) => {
    const list = cards.slice();
    list.splice(index, 1);
    setCards(list);
  };

  const toggleCard = (index: number) => {
    const list = cards.slice();
    list[index] = { ...list[index], active: list[index].active !== false ? false : true };
    setCards(list);
  };

  const saveCardsHandler = () => {
    saveCardsMutation.mutate(cards);
  };

  const saveYearsHandler = () => {
    saveYearsMutation.mutate(years);
  };

  const importHandler = async () => {
    if (!importFile) {
      toast.error('Excel dosyası seçin');
      return;
    }
    setImportLoading(true);
    try {
      const result = await importSlotData(importFile);
      setImportResult(result);
      toast.success(`Yüklendi: ${result.inserted} eklendi, ${result.updated} güncellendi`);
      setRefreshKey(k => k + 1);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Excel yükleme hatası';
      toast.error(message);
    } finally {
      setImportLoading(false);
    }
  };

  const updateLocalUser = (id: number, patch: Partial<AdminUser>) => {
    setLocalUsers(prev => prev.map(u => (u.ID === id ? { ...u, ...patch } : u)));
  };

  const saveUser = (id: number) => {
    const u = localUsers.find(x => x.ID === id);
    if (!u) return;
    const body: Record<string, unknown> = {
      email: u.Email,
      role: u.Role,
      territoryCodes: u.TerritoryCodes ?? [],
      isActive: u.IsActive === 1,
    };
    const pw = (passwordEdits[id] || '').trim();
    if (pw) body.password = pw;
    updateUserMutation.mutate(
      { id, body },
      {
        onSuccess: () => {
          setPasswordEdits(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        },
      }
    );
  };

  const territories = territoriesData ?? [];
  const usersPagination = usersData?.pagination;

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const role = (session?.user as { role?: string })?.role;
  if (role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Bu sayfaya erişim yetkiniz yok</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard" className="p-2 hover:bg-gray-100 rounded">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Yönetim</h1>
        </div>

        {activeTab === 'columns' && !!error && (
          <div className="mb-4 p-3 bg-amber-100 text-amber-800 rounded">
            {error.message}
          </div>
        )}

        <div className="card mb-6">
          <div className="p-3 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('users')}
              className={activeTab === 'users' ? 'btn btn-primary' : 'btn btn-secondary'}
            >
              Kullanıcılar
            </button>
            <button
              onClick={() => setActiveTab('years')}
              className={activeTab === 'years' ? 'btn btn-primary' : 'btn btn-secondary'}
            >
              Performans Yılları
            </button>
            <button
              onClick={() => setActiveTab('cards')}
              className={activeTab === 'cards' ? 'btn btn-primary' : 'btn btn-secondary'}
            >
              Dashboard Kartları
            </button>
            <button
              onClick={() => setActiveTab('columns')}
              className={activeTab === 'columns' ? 'btn btn-primary' : 'btn btn-secondary'}
            >
              Kolonlar
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={activeTab === 'import' ? 'btn btn-primary' : 'btn btn-secondary'}
            >
              <span className="inline-flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Sayım Yükleme
              </span>
            </button>
          </div>
        </div>

        {activeTab === 'years' && (
          <div className="card mb-6">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Performans Yılları</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-xs text-foreground-light">Baz Yıl (Before)</label>
              <input
                type="number"
                value={years.baselineYear}
                onChange={(e) => setYears({ ...years, baselineYear: Number(e.target.value) })}
                className="input mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-foreground-light">Hedef Yıl (Takip)</label>
              <input
                type="number"
                value={years.targetYear}
                onChange={(e) => setYears({ ...years, targetYear: Number(e.target.value) })}
                className="input mt-1"
              />
            </div>
            <button onClick={saveYearsHandler} disabled={saveYearsMutation.isPending} className="btn btn-primary">
              {saveYearsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Kaydet
            </button>
          </div>
          </div>
        )}

        {activeTab === 'import' && (
          <div className="card mb-6">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Sayım Excel Yükleme</h2>
            </div>
            <div className="p-4 grid grid-cols-1 lg:grid-cols-6 gap-3 items-end">
              <div className="lg:col-span-4">
                <label className="text-xs text-foreground-light">Excel Dosyası (.xlsx)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0] ?? null;
                    setImportFile(f);
                    setImportResult(null);
                  }}
                  className="input mt-1"
                />
              </div>
              <div className="lg:col-span-2 flex items-center gap-2">
                <button onClick={importHandler} disabled={importLoading} className="btn btn-primary w-full">
                  {importLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Yükle
                </button>
              </div>
            </div>
            {!!importResult && (
              <div className="p-4 border-t border-border">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded bg-gray-50 border border-border">
                    <div className="text-xs text-foreground-light">Eklendi</div>
                    <div className="text-lg font-semibold">{importResult.inserted}</div>
                  </div>
                  <div className="p-3 rounded bg-gray-50 border border-border">
                    <div className="text-xs text-foreground-light">Güncellendi</div>
                    <div className="text-lg font-semibold">{importResult.updated}</div>
                  </div>
                  <div className="p-3 rounded bg-gray-50 border border-border">
                    <div className="text-xs text-foreground-light">Atlandı</div>
                    <div className="text-lg font-semibold">{importResult.skipped}</div>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Satır</th>
                          <th>Hata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.errors.map((er) => (
                          <tr key={`${er.row}-${er.message}`}>
                            <td className="font-mono text-sm">{er.row}</td>
                            <td>{er.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="card mb-6">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Kullanıcı Yönetimi</h2>
            <button onClick={() => setRefreshKey(k => k + 1)} className="btn btn-secondary" title="Yenile">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {!!usersError && (
            <div className="p-4">
              <div className="p-3 bg-amber-100 text-amber-800 rounded">
                {(usersError as Error).message}
              </div>
            </div>
          )}

          <div className="p-4 border-b border-border">
            <details className="border border-border rounded-lg bg-white">
              <summary className="cursor-pointer select-none p-3 font-medium">
                Yeni Kullanıcı Oluştur
              </summary>
              <div className="p-3 border-t border-border">
                <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 items-end">
                  <div className="lg:col-span-2">
                    <label className="text-xs text-foreground-light">Ad Soyad</label>
                    <input
                      value={newUser.fullName}
                      onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                      className="input mt-1"
                      placeholder="Ad Soyad"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs text-foreground-light">Email</label>
                    <input
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="input mt-1"
                      placeholder="kullanici@firma.com"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-xs text-foreground-light">Şifre</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="input mt-1"
                      placeholder="En az 6 karakter"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-foreground-light">Rol</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                      className="input mt-1"
                    >
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newUser.isActive}
                        onChange={(e) => setNewUser({ ...newUser, isActive: e.target.checked })}
                      />
                      Aktif
                    </label>
                    <button
                      onClick={() => {
                        createUserMutation.mutate({
                          email: newUser.email,
                          fullName: newUser.fullName,
                          password: newUser.password,
                          role: newUser.role,
                          isActive: newUser.isActive,
                        });
                      }}
                      disabled={createUserMutation.isPending}
                      className="btn btn-primary"
                    >
                      {createUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                      Oluştur
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div className="p-4">
            <div className="mb-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                className="input pl-10"
                placeholder="Email / territory / rol ara..."
              />
            </div>

            {usersLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Territoryler</th>
                      <th>Aktif</th>
                      <th>Son Giriş</th>
                      <th>Yeni Şifre</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {localUsers.map(u => (
                      <tr key={u.ID}>
                        <td className="text-foreground-light font-mono">{u.ID}</td>
                        <td>
                          <input
                            value={u.Email ?? ''}
                            onChange={(e) => updateLocalUser(u.ID, { Email: e.target.value })}
                            className="input py-1 text-sm min-w-[220px]"
                          />
                        </td>
                        <td>
                          <select
                            value={(u.Role ?? 'user').toLowerCase()}
                            onChange={(e) => {
                              const r = e.target.value;
                              updateLocalUser(u.ID, {
                                Role: r,
                                TerritoryCode: r === 'admin' ? null : u.TerritoryCode,
                                TerritoryName: r === 'admin' ? null : u.TerritoryName,
                                TerritoryCodes: r === 'admin' ? [] : (u.TerritoryCodes ?? []),
                              });
                            }}
                            className="input py-1 text-sm min-w-[120px]"
                          >
                            <option value="admin">admin</option>
                            <option value="user">user</option>
                          </select>
                        </td>
                        <td className="min-w-[240px]">
                          {(u.Role ?? '').toLowerCase() === 'admin' ? (
                            <span className="text-foreground-light">-</span>
                          ) : (
                            <select
                              multiple
                              value={u.TerritoryCodes ?? []}
                              onChange={(e) => {
                                const codes = Array.from(e.currentTarget.selectedOptions).map(o => o.value);
                                const primaryCode = codes[0] ?? null;
                                const t = primaryCode ? territories.find(x => x.TerritoryCode === primaryCode) : undefined;
                                updateLocalUser(u.ID, {
                                  TerritoryCodes: codes,
                                  TerritoryCode: primaryCode,
                                  TerritoryName: t?.Territory ?? null,
                                });
                              }}
                              className="input py-1 text-sm min-w-[240px]"
                            >
                              {territories.map(t => (
                                <option key={t.TerritoryCode} value={t.TerritoryCode}>
                                  {t.Territory}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={u.IsActive === 1}
                            onChange={(e) => updateLocalUser(u.ID, { IsActive: e.target.checked ? 1 : 0 })}
                          />
                        </td>
                        <td className="text-foreground-light min-w-[170px]">
                          {u.LastLogin ?? '-'}
                        </td>
                        <td>
                          <input
                            type="password"
                            value={passwordEdits[u.ID] ?? ''}
                            onChange={(e) => setPasswordEdits(prev => ({ ...prev, [u.ID]: e.target.value }))}
                            className="input py-1 text-sm min-w-[160px]"
                            placeholder="Değiştir"
                          />
                        </td>
                        <td className="flex items-center gap-2">
                          <button
                            onClick={() => saveUser(u.ID)}
                            disabled={updateUserMutation.isPending}
                            className="btn btn-primary py-1.5 px-3"
                          >
                            {updateUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Kullanıcı pasifleştirilsin mi?')) {
                                deactivateUserMutation.mutate(u.ID);
                              }
                            }}
                            disabled={deactivateUserMutation.isPending}
                            className="p-2 hover:bg-red-100 text-red-600 rounded"
                            title="Pasifleştir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {localUsers.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-foreground-light">
                          Kayıt bulunamadı
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {usersPagination && usersPagination.totalPages > 1 && (
              <div className="flex items-center justify-between gap-4 mt-4">
                <p className="text-sm text-foreground-light">
                  Sayfa {usersPagination.page} / {usersPagination.totalPages} ({usersPagination.total} kullanıcı)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setUserPage(p => Math.max(1, p - 1))}
                    disabled={usersPagination.page === 1}
                    className="btn btn-secondary py-1.5 px-3 disabled:opacity-50"
                  >
                    Önceki
                  </button>
                  <button
                    onClick={() => setUserPage(p => Math.min(usersPagination.totalPages, p + 1))}
                    disabled={usersPagination.page === usersPagination.totalPages}
                    className="btn btn-secondary py-1.5 px-3 disabled:opacity-50"
                  >
                    Sonraki
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        )}

        {activeTab === 'cards' && (
          <div className="card mb-6">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Dashboard Kartları</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Kart Başlığı"
              value={newCard.label}
              onChange={(e) => setNewCard({ ...newCard, label: e.target.value })}
              className="input"
            />
            <input
              type="text"
              placeholder="Pay Anahtarı(lar) - virgülle ayırın (örn: SKU1, SKU2)"
              value={newCard.numeratorKey}
              onChange={(e) => setNewCard({ ...newCard, numeratorKey: e.target.value })}
              className="input"
            />
            <input
              type="text"
              placeholder="Payda Anahtarı(lar) - virgülle ayırın (örn: PM1, PM2)"
              value={newCard.denominatorKey}
              onChange={(e) => setNewCard({ ...newCard, denominatorKey: e.target.value })}
              className="input"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Çarpan"
                value={newCard.multiplier ?? 100}
                onChange={(e) => setNewCard({ ...newCard, multiplier: Number(e.target.value) })}
                className="input"
              />
              <input
                type="number"
                placeholder="Ondalık"
                value={newCard.decimals ?? 2}
                onChange={(e) => setNewCard({ ...newCard, decimals: Number(e.target.value) })}
                className="input"
              />
            </div>
            <button onClick={addCard} className="btn btn-primary">
              <Plus className="w-4 h-4" />
              Ekle
            </button>
            <div />
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {cards.map((c, i) => (
                <div key={i} className="p-3 border border-border rounded flex items-center gap-3 justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{c.label}</div>
                    <div className="text-xs text-foreground-light">
                      {(c.numeratorKeys && c.numeratorKeys.length ? c.numeratorKeys.join(', ') : c.numeratorKey) }
                      {' / '}
                      {(c.denominatorKeys && c.denominatorKeys.length ? c.denominatorKeys.join(', ') : c.denominatorKey) }
                      {' × '}
                      {c.multiplier ?? 1}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleCard(i)} className="btn btn-secondary">
                      {c.active === false ? 'Aktifleştir' : 'Pasifleştir'}
                    </button>
                    <button onClick={() => removeCard(i)} className="p-2 hover:bg-red-100 text-red-600 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {cards.length === 0 && <div className="text-foreground-light">Kart yok</div>}
            </div>
            <div className="mt-4">
              <button onClick={saveCardsHandler} disabled={saveCardsMutation.isPending} className="btn btn-primary">
                {saveCardsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Kartları Kaydet
              </button>
            </div>
          </div>
          </div>
        )}

        {activeTab === 'columns' && (
          <>
            <div className="card mb-6">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold">Yeni Kolon Ekle</h2>
              </div>
              <div className="p-4 flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Kolon Anahtarı (örn: YENI_URUN)"
                  value={newColumn.key}
                  onChange={(e) => setNewColumn({ ...newColumn, key: e.target.value.toUpperCase() })}
                  className="input flex-1"
                />
                <input
                  type="text"
                  placeholder="Görünen Ad (örn: Yeni Ürün)"
                  value={newColumn.label}
                  onChange={(e) => setNewColumn({ ...newColumn, label: e.target.value })}
                  className="input flex-1"
                />
                <button onClick={handleAddColumn} className="btn btn-primary">
                  <Plus className="w-4 h-4" />
                  Ekle
                </button>
              </div>
            </div>

            <div className="card mb-6">
              <div className="p-4 border-b border-border flex justify-between items-center">
                <h2 className="font-semibold">Mevcut Kolonlar ({localColumns.length})</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRefreshKey(k => k + 1)}
                    className="btn btn-secondary"
                    title="Yenile"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Veritabanından kolonları çekmek istediğinize emin misiniz?')) {
                        syncMutation.mutate();
                      }
                    }}
                    className="btn btn-secondary"
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'DB\'den Çek'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="btn btn-primary"
                  >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    Kaydet
                  </button>
                </div>
              </div>

              <DndContext
                key={refreshKey}
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localColumns.map(c => c.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-border">
                    {localColumns.map((col, index) => (
                      <SortableItem
                        key={col.key}
                        id={col.key}
                        col={col}
                        index={index}
                        onDelete={() => handleDelete(index)}
                        onUpdate={(key, label) => handleUpdate(index, key, label)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
