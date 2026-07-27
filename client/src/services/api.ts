import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
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

  create: (data: { name: string; tag: string; page_number: number }) =>
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

  createPeriod: (start_date: string, end_date: string) =>
    api.post('/shifts/periods', { start_date, end_date }),

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

export default api;