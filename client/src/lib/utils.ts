import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

export function formatNumber(n: number, decimals = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

export function formatCurrency(n: number) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
