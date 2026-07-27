import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { preferenceApi, employeeApi } from '../services/api';
import { generateDateRange, formatMonthDay, getDayName, isSaturday, isSunday } from '../utils/dateUtils';
import { HOLIDAYS_2025_2026 } from '../utils/holidays';
import './PreferenceSummary.css';

interface PreferenceSummaryProps {
  showQRCodes?: boolean;
}

function PreferenceSummary({ showQRCodes = false }: PreferenceSummaryProps) {
  const { periodId } = useParams();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [allPrefs, setAllPrefs] = useState<any[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [period, setPeriod] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [periodId]);

  const loadData = async () => {
    try {
      const [empRes, summaryRes, prefsRes] = await Promise.all([
        employeeApi.getAll(),
        preferenceApi.getSummary(Number(periodId)),
        preferenceApi.getAllPrefs(Number(periodId))
      ]);
      setEmployees(empRes.data);
      setSummary(summaryRes.data);
      setAllPrefs(prefsRes.data);
      if (empRes.data.length > 0) {
        const periodsRes = await (await import('../services/api')).shiftApi.getPeriods();
        const per = periodsRes.data.find((p: any) => p.id === Number(periodId));
        if (per) { setPeriod(per); setDates(generateDateRange(per.start_date, per.end_date)); }
      }
    } catch (error) { console.error('Failed to load:', error); }
    finally { setLoading(false); }
  };

  const getSummaryForDate = (date: string) => summary.find((s) => s.date === date);
  const isHoliday = (date: string): boolean => HOLIDAYS_2025_2026.some((h) => h.date === date);
  const isEmployeeAvailable = (employeeId: number, date: string): boolean | null => {
    const pref = allPrefs.find((p) => p.employee_id === employeeId && p.date === date);
    if (!pref) return null;
    return pref.available === 1;
  };

  if (loading) return <div className="loading">読み込み中...</div>;

  return (
    <div className="ps-container">
      <div className="ps-header">
        <button onClick={() => navigate('/')} className="back-btn">戻る</button>
        <h2>シフト希望一覧</h2>
        {period && <span className="ps-period">{formatMonthDay(period.start_date)} 〜 {formatMonthDay(period.end_date)}</span>}
      </div>
      <div className="ps-info"><p>各日付に出勤可能な従業員数を表示しています。</p></div>

      {showQRCodes && (
        <div className="ps-qr-section">
          <h3>従業員用 提出URL・QRコード</h3>
          <p className="ps-qr-hint">各従業員にQRコードを渡してください。このURLは毎月使い回せます。</p>
          <div className="ps-qr-list">
            {employees.map((emp) => {
              const baseUrl = window.location.origin;
              const url = baseUrl + '/prefer/' + emp.id;
              const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(url);
              return (
                <div key={emp.id} className="ps-qr-item">
                  <img src={qrUrl} alt={emp.name + ' QR'} className="ps-qr-img" />
                  <div className="ps-qr-name">{emp.name}</div>
                  <div className="ps-qr-tag">{emp.tag}</div>
                  <div className="ps-qr-url"><input type="text" readOnly value={url} onClick={(e) => (e.target as HTMLInputElement).select()} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="ps-table-container">
        <table className="ps-table">
          <thead>
            <tr>
              <th className="ps-name-header">氏名</th>
              {dates.map((date) => {
                const dayName = getDayName(date);
                const isSat = isSaturday(date);
                const isSun = isSunday(date);
                const isHol = isHoliday(date);
                const cls = isSat ? 'saturday' : (isSun || isHol) ? 'sunday' : '';
                return <th key={date} className={"ps-date-header " + cls}><div>{formatMonthDay(date)}</div><div className="ps-day-name">{dayName}</div></th>;
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td className="ps-name-cell">{emp.name}</td>
                {dates.map((date) => {
                  const available = isEmployeeAvailable(emp.id, date);
                  let cls = 'ps-cell';
                  if (available === true) cls += ' yes';
                  else if (available === false) cls += ' no';
                  else cls += ' unknown';
                  return <td key={date} className={cls}>{available === true ? '◯' : available === false ? '✕' : '-'}</td>;
                })}
              </tr>
            ))}
            <tr className="ps-total-row">
              <td className="ps-name-cell">合計</td>
              {dates.map((date) => { const s = getSummaryForDate(date); const count = s ? s.count : 0; return <td key={date} className="ps-total-cell">{count > 0 ? count : '-'}</td>; })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PreferenceSummary;
