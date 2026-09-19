export type Src = 'jsonld' | 'text' | 'llm' | 'user';
export interface Listing {
  url: string; image?: string; title?: string; suburb?: string; propertyType?: string;
  price?: number; beds?: number; baths?: number; parking?: number;
  floorSqm?: number; erfSqm?: number; levy?: number; rates?: number;
  titleType: 'freehold' | 'sectional' | 'unknown';
  features: string[];
  /** where each field came from, so the report can separate listing facts from estimates */
  src: Record<string, Src>;
}
export interface Comp { price: number; floorSqm?: number; erfSqm?: number; date?: string; address?: string }
export interface Profile {
  buyer: 'first-time' | 'investor' | 'upgrader';
  depositPct: number; rate: number; termYears: number;
  grossIncome?: number; monthlyRent?: number; vatSale?: boolean; city?: 'ct';
}
