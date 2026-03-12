export interface User {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: 'admin' | 'user';
  territoryCode?: string;
  territoryCodes?: string[];
}

export interface AdminUser {
  ID: number;
  TerritoryCode: string | null;
  TerritoryName: string | null;
  TerritoryCodes?: string[];
  Email: string | null;
  Role: string | null;
  IsActive: number;
  LastLogin: string | null;
}

export interface AdminUsersApiResponse {
  users: AdminUser[];
  pagination: Pagination;
}

export interface TerritoryOption {
  TerritoryCode: string;
  Territory: string;
}

export interface DashboardStats {
  totalBayi: number;
  kayitliBayi: number;
  sonGuncelleme: string | null;
  ortalamaSlot: number | null;
}

export interface RecentUpdate {
  CustomerCode: string;
  CustomerName: string;
  Date: string;
  SlotSayisi: number;
  Territory: string;
}

export interface Bayi {
  TerritoryCode: string;
  Territory: string;
  CustomerCode: string;
  CustomerName: string;
  TradeCategoryDescription: string;
  SubTradeCategoryDescription: string;
  AddressLevel2Description: string;
  SonGuncelleme: string | null;
  SonSlot: number | null;
  HasSlotData?: number;
  Has2026?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface BayiApiResponse {
  bayiler: Bayi[];
  pagination: Pagination;
  targetYear?: number;
}

export interface DashboardApiResponse {
  stats: DashboardStats;
  recentUpdates: RecentUpdate[];
  cards?: Array<{ label: string; value: number | null; decimals?: number }>;
  cardsBefore?: Array<{ label: string; value: number | null; decimals?: number }>;
  baselineYear?: number;
}

export interface PerformanceRow {
  CustomerCode: string;
  CustomerName: string;
  Territory: string;
  TerritoryCode: string;
  BeforeDate: string | null;
  AfterDate: string | null;
  BeforeValue: number | null;
  AfterValue: number | null;
  Delta: number | null;
  HasTargetYear: number;
}

export interface PerformanceApiResponse {
  baselineYear: number;
  targetYear: number;
  cardLabels: string[];
  selectedCard: { label: string; decimals: number; multiplier: number } | null;
  territoryCode: string | null;
  territories?: Array<{ TerritoryCode: string; Territory: string }>;
  rows: PerformanceRow[];
  pagination: Pagination;
  summary: {
    beforeValue: number | null;
    afterValue: number | null;
    delta: number | null;
    totalBayiler: number;
    missingBaseline: number;
    missingAfter: number;
    missingTargetYear: number;
  };
}

export interface TerritoryPerformanceRow {
  TerritoryCode: string;
  Territory: string;
  BeforeDate: string | null;
  AfterDate: string | null;
  BeforeValue: number | null;
  AfterValue: number | null;
  Delta: number | null;
  TotalBayiler: number;
  MissingBaseline: number;
  MissingAfter: number;
}

export interface TerritoryPerformanceApiResponse {
  baselineYear: number;
  targetYear: number;
  cardLabels: string[];
  selectedCard: { label: string; decimals: number; multiplier: number } | null;
  territoryCode: string | null;
  territories?: Array<{ TerritoryCode: string; Territory: string }>;
  rows: TerritoryPerformanceRow[];
  pagination: Pagination;
  summary: {
    beforeValue: number | null;
    afterValue: number | null;
    delta: number | null;
    totalBayiler: number;
    missingBaseline: number;
    missingAfter: number;
  };
}

export interface SlotChange {
  ID: number;
  CustomerCode: string;
  SlotColumn: string;
  OldValue: number | null;
  NewValue: number;
  ChangedAt: string;
  ChangedBy: string;
}

export interface SlotColumn {
  key: string;
  label: string;
  order?: number;
}

export interface BayiDetailData {
  aa?: number;
  Region?: string;
  Zone?: string;
  Date?: string;
  [key: string]: unknown;
}

export interface BayiDetail {
  bayi: Bayi;
  currentData: BayiDetailData | null;
  history: BayiDetailData[];
  changes: SlotChange[];
}

export interface ChartDataPoint {
  date: string;
  slot: number;
  endustri: number;
  top3: number;
}

export interface BayiFilter {
  search?: string;
  page?: number;
  limit?: number;
}

export interface ApiError {
  error: string;
}
