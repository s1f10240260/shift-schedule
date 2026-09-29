export interface Store {
  id: number;
  name: string;
}

export interface Employee {
  id: number;
  store_id: number;
  name: string;
  tag: string;
  page_number: number;
  sort_order: number;
  annual_hours: number;
  email?: string;
}

export interface ShiftPeriod {
  id: number;
  store_id: number;
  start_date: string;
  end_date: string;
}

export interface Shift {
  id: number;
  employee_id: number;
  period_id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  is_off: number;
}

export interface RequiredStaff {
  id: number;
  store_id: number;
  day_of_week: number;
  hour: number;
  required_count: number;
}

export interface DateOverride {
  id: number;
  store_id: number;
  date: string;
  hour: number;
  required_count: number;
  reason: string | null;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

export const EMPLOYEE_TAGS = [
  "店長",
  "副店長",
  "社員",
  "新人社員",
  "バイト",
  "学生バイト",
  "新人バイト"
] as const;

export type EmployeeTag = typeof EMPLOYEE_TAGS[number];

export const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

export const HOURS = Array.from({ length: 24 }, (_, i) => (i + 5) % 24);