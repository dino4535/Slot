import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatNumber(num: number | null | undefined) {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString('tr-TR');
}

let cachedColumns: { key: string; label: string }[] | null = null;

export const defaultSlotColumns = [
  { key: 'Total _Pm _Slot _Sayısı', label: 'Toplam PM Slot' },
  { key: 'Total _Top3 _Sku _Slot _Sayısı', label: 'Top3 SKU Slot' },
  { key: 'Total_Stratejik_SKU_Slot_Sayısı', label: 'Stratejik SKU' },
  { key: 'Endüstri _Slot', label: 'Endüstri Slot' },
  { key: 'J _Firma Slot Sayısı', label: 'J Firma Slot' },
  { key: 'B _Firma Slot Sayısı', label: 'B Firma Slot' },
  { key: 'CHMODENAVY', label: 'CHMODENAVY' },
  { key: 'CHNAVYBRCB', label: 'CHNAVYBRCB' },
  { key: 'CHNB100RCB', label: 'CHNB100RCB' },
  { key: 'LAB100RCB', label: 'LAB100RCB' },
  { key: 'LARKBRCB', label: 'LARKBRCB' },
  { key: 'LM100RCB', label: 'LM100RCB' },
  { key: 'LMRCB', label: 'LMRCB' },
  { key: 'MFTB', label: 'MFTB' },
  { key: 'MLEDBLUE', label: 'MLEDBLUE' },
  { key: 'MLEDGE', label: 'MLEDGE' },
  { key: 'MLEDSKY', label: 'MLEDSKY' },
  { key: 'MLEDSLIMS', label: 'MLEDSLIMS' },
  { key: 'MLFTB', label: 'MLFTB' },
  { key: 'MLR100', label: 'MLR100' },
  { key: 'MLROLL50', label: 'MLROLL50' },
  { key: 'MLRTGRAYRCB', label: 'MLRTGRAYRCB' },
  { key: 'MLTBLUE', label: 'MLTBLUE' },
  { key: 'MLTGRAY', label: 'MLTGRAY' },
  { key: 'MLTONE', label: 'MLTONE' },
  { key: 'MUABLU', label: 'MUABLU' },
  { key: 'MUARCB', label: 'MUARCB' },
  { key: 'PL100', label: 'PL100' },
  { key: 'PLABS100', label: 'PLABS100' },
  { key: 'PLLONGRCB', label: 'PLLONGRCB' },
  { key: 'PLLRC', label: 'PLLRC' },
  { key: 'PLMNRCB', label: 'PLMNRCB' },
  { key: 'PLRC', label: 'PLRC' },
  { key: 'PLRSVRCB', label: 'PLRSVRCB' },
];

export const slotColumns = defaultSlotColumns;

export async function getSlotColumns() {
  if (cachedColumns) return cachedColumns;
  
  try {
    const res = await fetch('/api/admin/columns', { cache: 'no-store' });
    const data: { columns?: Array<{ key: string; label: string; order?: number }> } = await res.json();
    if (data.columns && data.columns.length > 0) {
      cachedColumns = data.columns
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(c => ({ key: c.key, label: c.label }));
      return cachedColumns;
    }
  } catch (e) {
    console.error('Error fetching columns:', e);
  }
  
  cachedColumns = defaultSlotColumns;
  return cachedColumns;
}
