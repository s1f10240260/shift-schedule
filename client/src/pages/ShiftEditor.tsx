import { useState, useEffect, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { shiftApi, settingsApi } from '../services/api';
import { generateDateRange, formatMonthDay, getDayName, isSaturday, isSunday } from '../utils/dateUtils';
import './ShiftEditor.css';

interface ShiftData {
  [employeeId: number]: {
    [date: string]: {
      startTime: string;
      endTime: string;
      isOff: boolean;
    }
  }
}

function parseTime(timeStr: string): number | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours + minutes / 60;
}

function calcHours(startStr: string, endStr: string): number {
  const start = parseTime(startStr);
  const end = parseTime(endStr);
  if (start === null || end === null) return 0;
  if (end > start) return end - start;
  return (24 - start) + end;
}

function formatHours(hours: number): string {
  if (hours === 0) return '';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return String(h);
  return String(h) + "." + String(m);
}

function exportCSV(dates: string[], employees: any[], shifts: ShiftData) {
  const rows: string[][] = [];
  const headerRow = ['氏名'];
  dates.forEach((date) => {
    const d = new Date(date);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dayName = getDayName(date);
    headerRow.push(String(m) + "/" + String(day) + "(" + dayName + ")");
  });
  rows.push(headerRow);

  employees.forEach((emp) => {
    const row = [emp.name];
    dates.forEach((date) => {
      const shiftData = shifts[emp.id]?.[date];
      if (shiftData?.isOff) {
        row.push('休');
      } else if (shiftData?.startTime && shiftData?.endTime) {
        row.push(shiftData.startTime + "~" + shiftData.endTime);
      } else {
        row.push('');
      }
    });
    rows.push(row);
  });

  const csv = rows.map((r) => r.join(",")).join("\n");
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shift_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function ShiftEditor() {
  const { periodId } = useParams();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [shifts, setShifts] = useState<ShiftData>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    if (!target.dataset.row || !target.dataset.col || !target.dataset.field) return;
    const row = parseInt(target.dataset.row, 10);
    const col = parseInt(target.dataset.col, 10);
    const field = target.dataset.field;
    const totalCols = dates.length;
    let nextRow = row;
    let nextCol = col;
    let nextField = field;

    switch (e.key) {
      case 'ArrowRight':
        nextCol = Math.min(col + 1, totalCols - 1);
        nextField = field;
        break;
      case 'ArrowLeft':
        nextCol = Math.max(col - 1, 0);
        nextField = field;
        break;
      case 'ArrowDown':
        nextRow = row + 1;
        nextField = field;
        break;
      case 'ArrowUp':
        nextRow = row - 1;
        nextField = field;
        break;
      case 'Tab':
        if (e.shiftKey) {
          if (field === 'start') {
            nextCol = Math.max(col - 1, 0);
            nextField = 'end';
          } else {
            nextField = 'start';
          }
        } else {
          if (field === 'end') {
            nextCol = Math.min(col + 1, totalCols - 1);
            nextField = 'start';
          } else {
            nextField = 'end';
          }
        }
        break;
      default:
        return;
    }

    e.preventDefault();
    const selector = '[data-row="' + nextRow + '"][data-col="' + nextCol + '"][data-field="' + nextField + '"]';
    const nextInput = document.querySelector(selector) as HTMLInputElement;
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  useEffect(() => {
    loadData();
  }, [periodId]);

  const loadData = async () => {
    try {
      const periodsRes = await shiftApi.getPeriods();
      const currentPeriod = periodsRes.data.find((p: any) => p.id === Number(periodId));

      if (!currentPeriod) {
        navigate('/');
        return;
      }

      setPeriod(currentPeriod);
      setDates(generateDateRange(currentPeriod.start_date, currentPeriod.end_date));

      const [shiftsRes, holidaysRes] = await Promise.all([
        shiftApi.getShifts(Number(periodId)),
        settingsApi.getHolidays()
      ]);

      setEmployees(shiftsRes.data.employees);
      setHolidays(holidaysRes.data);

      const shiftMap: ShiftData = {};
      shiftsRes.data.employees.forEach((emp: any) => {
        shiftMap[emp.id] = {};
      });

      shiftsRes.data.shifts.forEach((shift: any) => {
        if (!shiftMap[shift.employee_id]) {
          shiftMap[shift.employee_id] = {};
        }
        shiftMap[shift.employee_id][shift.date] = {
          startTime: shift.start_time || '',
          endTime: shift.end_time || '',
          isOff: shift.is_off === 1
        };
      });

      setShifts(shiftMap);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateShift = (employeeId: number, date: string, field: string, value: any) => {
    setShifts((prev) => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [date]: {
          ...prev[employeeId]?.[date],
          [field]: value
        }
      }
    }));
  };

  const saveShifts = async () => {
    setSaving(true);
    try {
      const shiftArray: any[] = [];
      Object.entries(shifts).forEach(([employeeId, employeeShifts]) => {
        Object.entries(employeeShifts).forEach(([date, shiftData]: [string, any]) => {
          if (shiftData.startTime || shiftData.isOff) {
            shiftArray.push({
              employee_id: Number(employeeId),
              date: date,
              start_time: shiftData.startTime || null,
              end_time: shiftData.endTime || null,
              is_off: shiftData.isOff ? 1 : 0
            });
          }
        });
      });

      await shiftApi.saveShifts(Number(periodId), shiftArray);
      alert('保存しました');
    } catch (error) {
      console.error('Failed to save shifts:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const isHoliday = (date: string): boolean => {
    return holidays.some((h) => h.date === date);
  };

  const getPageEmployees = () => {
    return employees
      .filter((e) => e.page_number === currentPage)
      .sort((a, b) => a.sort_order - b.sort_order);
  };

  const MAX_ROWS = 19;
  const pages = [...new Set(employees.map((e) => e.page_number))].sort((a, b) => a - b);

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  const displayEmployees = getPageEmployees();
  const emptyRows = MAX_ROWS - displayEmployees.length;

  const calcEmployeeHours = (empId: number): number => {
    let total = 0;
    dates.forEach((date) => {
      const d = shifts[empId]?.[date];
      if (d && !d.isOff && d.startTime && d.endTime) {
        total += calcHours(d.startTime, d.endTime);
      }
    });
    return total;
  };

  return (
    <div className="shift-editor">
      <div className="editor-header">
        <button onClick={() => navigate('/')} className="back-btn">
          ダッシュボードに戻る
        </button>
        <h2>
          {period && formatMonthDay(period.start_date) + " 〜 " + formatMonthDay(period.end_date)}
        </h2>
        <div className="header-actions">
          <button onClick={() => navigate("/preferences/" + periodId)} className="pref-btn">
            希望一覧
          </button>
          <button onClick={() => exportCSV(dates, displayEmployees, shifts)} className="export-btn">
            CSV出力
          </button>
          <button onClick={saveShifts} className="save-btn" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {pages.length > 1 && (
        <div className="page-tabs">
          {pages.map((page) => (
            <button
              key={page}
              className={currentPage === page ? 'active' : ''}
              onClick={() => setCurrentPage(page)}
            >
              ページ {page}
            </button>
          ))}
        </div>
      )}

      <div className="shift-table-container">
        <table className="shift-table">
          <thead>
            <tr>
              <th className="employee-header">氏名</th>
              {dates.map((date) => {
                const dayName = getDayName(date);
                const isSat = isSaturday(date);
                const isSun = isSunday(date);
                const isHol = isHoliday(date);
                const className = isSat ? 'saturday' : (isSun || isHol) ? 'sunday' : '';

                return (
                  <th key={date} className={"date-header " + className}>
                    <div className="date-main">{formatMonthDay(date)}</div>
                    <div className="date-day">{dayName}</div>
                  </th>
                );
              })}
              <th className="total-header">合計</th>
            </tr>
          </thead>
          <tbody>
            {displayEmployees.map((employee, empIdx) => {
              const totalHours = calcEmployeeHours(employee.id);
              return (
                <tr key={employee.id}>
                  <td className="employee-cell">
                    <div className="employee-name">{employee.name}</div>
                  </td>
                  {dates.map((date, dateIdx) => {
                    const shiftData = shifts[employee.id]?.[date];
                    const isSat = isSaturday(date);
                    const isSun = isSunday(date);
                    const isHol = isHoliday(date);
                    const cellClass = isSat ? 'saturday' : (isSun || isHol) ? 'sunday' : '';
                    const dayHours = (shiftData && !shiftData.isOff && shiftData.startTime && shiftData.endTime)
                      ? calcHours(shiftData.startTime, shiftData.endTime) : 0;

                    return (
                      <td key={date} className={"shift-cell " + cellClass}
                        onDoubleClick={() => updateShift(employee.id, date, 'isOff', !shiftData?.isOff)}>
                        {shiftData?.isOff ? (
                          <div className="off-mark">✕</div>
                        ) : (
                          <div className="time-inputs">
                            <input
                              type="text"
                              value={shiftData?.startTime || ''}
                              onChange={(e) => updateShift(employee.id, date, 'startTime', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder="--"
                              className="time-input"
                              data-row={empIdx}
                              data-col={dateIdx}
                              data-field="start"
                            />
                            <input
                              type="text"
                              value={shiftData?.endTime || ''}
                              onChange={(e) => updateShift(employee.id, date, 'endTime', e.target.value)}
                              onKeyDown={handleInputKeyDown}
                              placeholder="--"
                              className="time-input"
                              data-row={empIdx}
                              data-col={dateIdx}
                              data-field="end"
                            />
                          </div>
                        )}
                        {dayHours > 0 && <div className="day-hours">{formatHours(dayHours)}</div>}
                      </td>
                    );
                  })}
                  <td className="total-cell">
                    {totalHours > 0 && formatHours(totalHours)}
                  </td>
                </tr>
              );
            })}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={"empty-" + i}>
                <td className="employee-cell"></td>
                {dates.map((date) => {
                  const isSat = isSaturday(date);
                  const isSun = isSunday(date);
                  const isHol = isHoliday(date);
                  const cellClass = isSat ? 'saturday' : (isSun || isHol) ? 'sunday' : '';
                  return <td key={date} className={"shift-cell " + cellClass}></td>;
                })}
                <td className="total-cell"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ShiftEditor;