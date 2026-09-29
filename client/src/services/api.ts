import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = "Bearer " + token;
  }
  return config;
});

export const authApi = {
  login: (name: string, password: string) =>
    api.post('/auth/login', { name, password }),

  register: (name: string, password: string) =>
    api.post('/auth/register', { name, password })
};

export const employeeApi = {
  getAll: () => api.get('/employees'),

  create: (data: { name: string; tag: string; page_number: number; email?: string }) =>
    api.post('/employees', data),

  update: (id: number, data: any) =>
    api.put("/employees/" + id, data),

  delete: (id: number) =>
    api.delete("/employees/" + id),

  reorder: (employees: Array<{ id: number; page_number: number; sort_order: number }>) =>
    api.post('/employees/reorder', { employees })
};

export const shiftApi = {
  getPeriods: () => api.get('/shifts/periods'),

  createPeriod: (start_date: string, end_date: string, deadline?: string) =>
    api.post('/shifts/periods', { start_date, end_date, deadline }),

  getShifts: (periodId: number) =>
    api.get("/shifts/period/" + periodId),

  saveShifts: (period_id: number, shifts: any[]) =>
    api.post('/shifts/save', { period_id, shifts }),

  getAnnualHours: () => api.get('/shifts/annual-hours'),

  archiveOldShifts: (monthsToKeep?: number) =>
    api.post('/shifts/archive', { monthsToKeep: monthsToKeep || 3 }),

  calculateMonthlySummary: (period_id: number) =>
    api.post('/shifts/monthly-summary/calculate', { period_id }),

  getMonthlySummary: () => api.get('/shifts/monthly-summary'),

  cleanupEmptyShifts: () => api.post('/shifts/cleanup')
};

export const preferenceApi = {
  getSummary: (periodId: number) =>
    api.get("/preferences/summary/" + periodId),

  getEmployeePrefs: (employeeId: number, periodId: number) =>
    api.get("/preferences/employee/" + employeeId + "/" + periodId),

  getAllPrefs: (periodId: number) =>
    api.get("/preferences/all/" + periodId),

  savePrefs: (employeeId: number, periodId: number, dates: any[]) =>
    api.post('/preferences/save', { employee_id: employeeId, period_id: periodId, dates }),

  publicSubmit: (employeeId: number, periodId: number, dates: any[]) =>
    api.post('/preferences/public-submit', { employee_id: employeeId, period_id: periodId, dates }),

  getPublicData: (employeeId: number, periodId: number) =>
    api.get("/preferences/public/" + employeeId + "/" + periodId),

  getPublicEmployee: (employeeId: number) =>
    api.get("/preferences/public-employee/" + employeeId),

  getPublicPeriods: (employeeId: number) =>
    api.get("/preferences/public-periods/" + employeeId),

  getPublicEmployees: (periodId: number) =>
    api.get("/preferences/public-employees/" + periodId)
};

export const settingsApi = {
  getRequiredStaff: () => api.get('/settings/required-staff'),

  saveRequiredStaff: (data: { day_of_week: number; hour: number; required_count: number }) =>
    api.post('/settings/required-staff', data),

  getDateOverrides: (date: string) =>
    api.get("/settings/date-overrides/" + date),

  saveDateOverride: (data: { date: string; hour: number; required_count: number; reason?: string }) =>
    api.post('/settings/date-overrides', data),

  getHolidays: (year?: number) =>
    api.get("/settings/holidays" + (year ? "/" + year : ''))
};

export const emailApi = {
  getSettings: () => api.get('/email/settings'),

  saveSettings: (data: {
    smtp_host: string;
    smtp_port: number;
    smtp_user: string;
    smtp_pass?: string;
    from_name?: string;
    from_email?: string;
  }) => api.post('/email/settings', data),

  sendTest: (to: string) => api.post('/email/test', { to }),

  getShortages: (periodId: number) => api.get("/email/shortages/" + periodId),

  preview: (data: {
    period_id: number;
    subject?: string;
    message?: string;
    include_shortages?: boolean;
  }) => api.post('/email/preview', data),

  sendBulk: (data: {
    period_id: number;
    tags?: string[];
    employee_ids?: number[];
    subject: string;
    message?: string;
    body?: string;
    include_shortages?: boolean;
    send_mode?: 'individual' | 'bcc';
  }) => api.post('/email/send-bulk', data),

  getTemplates: () => api.get('/email/templates'),

  saveTemplate: (data: { id?: number; name: string; subject?: string; body?: string }) =>
    api.post('/email/templates', data),

  deleteTemplate: (id: number) => api.delete("/email/templates/" + id)
};

export default api;