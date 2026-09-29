import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { preferenceApi, employeeApi } from '../services/api';
import { generateDateRange, formatMonthDay, getDayName, isSaturday, isSunday } from '../utils/dateUtils';
import { HOLIDAYS_2025_2026 } from '../utils/holidays';
import './PreferenceSummary.css';

interface PreferenceSummaryProps {
  showQRCodes?: boolean;
}

function QRItem({ emp }: { emp: any }) {
  const [dataUrl, setDataUrl] = useState('');
  const url = window.location.origin + '/prefer/' + emp.id;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then((d) => setDataUrl(d))
      .catch(() => {});
  }, [url]);

  return (
    <div className="ps-qr-item">
      {dataUrl ? (
        <img src={dataUrl} alt={emp.name + ' QR'} className="ps-qr-img" />
      ) : (
        <div className="ps-qr-img ps-qr-loading">生成中...</div>
      )}
      <div className="ps-qr-name">{emp.name}</div>
      <div className="ps-qr-tag">{emp.tag}</div>
      <div className="ps-qr-url"><input type="text" readOnly value={url} onClick={(e) => (e.target as HTMLInputElement).select()} /></div>
      <a className="ps-qr-download" href={dataUrl || '#'} download={'QR_' + emp.name + '.png'}>PNGダウンロード</a>
    </div>
  );
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
  const getPref = (employeeId: number, date: string) =>
    allPrefs.find((p) => p.employee_id === employeeId && p.date === date);
  const fmtT = (t: string) => (t ? t.replace(/^0/, '').replace(/:00$/, '') : t);

  if (loading) return <div className="loading">読み込み中...</div>;

  return (
    <div className="ps-container">
      <div className="ps-header">
        <button onClick={() => navigate('/')} className="back-btn">戻る</button>
        <h2>{showQRCodes ? 'QRコード一覧' : 'シフト希望一覧'}</h2>
        {!showQRCodes && period && <span className="ps-period">{formatMonthDay(period.start_date)} 〜 {formatMonthDay(period.end_date)}</span>}
      </div>
      {!showQRCodes && <div className="ps-info"><p>各日付に入れることのできる時間を表示しています（例: 17〜22）。日付は朝5時〜翌朝5時の1日です。</p></div>}

      {showQRCodes && (
        <div className="ps-qr-section">
          <p className="ps-qr-hint">各従業員にQRコードを渡してください。このURLは毎月使い回せます。PNGダウンロードで画像を保存すれば、メールやLINEで配れます。</p>
          <div className="ps-qr-list">
            {employees.map((emp) => (
              <QRItem key={emp.id} emp={emp} />
            ))}
          </div>
        </div>
      )}
      {!showQRCodes && (<div className="ps-table-container">
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
                  const pref = getPref(emp.id, date);
                  const hasTime = !!(pref && pref.start_time && pref.end_time);
                  let cls = 'ps-cell';
                  if (hasTime) cls += ' yes';
                  else if (pref) cls += ' no';
                  else cls += ' unknown';
                  const label = hasTime ? fmtT(pref.start_time) + '〜' + fmtT(pref.end_time) : '-';
                  return <td key={date} className={cls}>{label}</td>;
                })}
              </tr>
            ))}
            <tr className="ps-total-row">
              <td className="ps-name-cell">合計</td>
              {dates.map((date) => { const s = getSummaryForDate(date); const count = s ? s.count : 0; return <td key={date} className="ps-total-cell">{count > 0 ? count : '-'}</td>; })}
            </tr>
          </tbody>
        </table>
      </div>)}
    </div>
  );
}

export default PreferenceSummary;
