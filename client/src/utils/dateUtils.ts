import { DAY_NAMES } from '../types';

export function getWeekday(dateString: string): number {
  const date = new Date(dateString);
  return date.getDay();
}

export function isWeekend(dateString: string): boolean {
  const day = getWeekday(dateString);
  return day === 0 || day === 6;
}

export function isSaturday(dateString: string): boolean {
  return getWeekday(dateString) === 6;
}

export function isSunday(dateString: string): boolean {
  return getWeekday(dateString) === 0;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + "-" + month + "-" + day;
}

export function formatMonthDay(dateString: string): string {
  const date = new Date(dateString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return month + "/" + day;
}

export function getDayName(dateString: string): string {
  return DAY_NAMES[getWeekday(dateString)];
}

export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function getCurrentPeriod(): { start: string; end: string } {
  const today = new Date();
  const day = today.getDate();

  let start: Date;
  let end: Date;

  if (day >= 11) {
    start = new Date(today.getFullYear(), today.getMonth() + 1, 11);
    end = new Date(today.getFullYear(), today.getMonth() + 2, 10);
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 11);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 10);
  }

  return {
    start: formatDate(start),
    end: formatDate(end)
  };
}