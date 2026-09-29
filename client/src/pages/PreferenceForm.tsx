import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { preferenceApi } from '../services/api';
import { generateDateRange, formatMonthDay, getDayName } from '../utils/dateUtils';
import { HOLIDAYS_2025_2026 } from '../utils/holidays';
import './PreferenceForm.css';

interface PrefEntry {
  start: string;
  end: string;
  note: string;
}

const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let h = 0; h < 24; h++) {
  for (const mm of ['00', '30']) {
    const value = String(h).padStart(2, '0') + ':' + mm;
    const label = h + ':' + mm + (h < 5 ? '（翌）' : '');
    TIME_OPTIONS.push({ value, label });
  }
}

function PreferenceForm() {
  const { employeeId } = useParams();
  const [employee, setEmployee] = useState<any>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<{ [date: string]: PrefEntry }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadEmployeeData(); }, [employeeId]);
  useEffect(() => { if (selectedPeriod) loadPeriodData(); }, [selectedPeriod]);

  const loadEmployeeData = async () => {
    try {
      const [empRes, periodsRes] = await Promise.all([
        preferenceApi.getPublicEmployee(Number(employeeId)),
        preferenceApi.getPublicPeriods(Number(employeeId))
      ]);
      setEmployee(empRes.data);
      setPeriods(periodsRes.data);
    } catch (error) { console.error('Failed to load:', error); }
    finally { setLoading(false); }
  };

  const loadPeriodData = async () => {
    try {
      const res = await preferenceApi.getPublicData(Number(employeeId), selectedPeriod.id);
      const allDates = generateDateRange(selectedPeriod.start_date, selectedPeriod.end_date);
      setDates(allDates);
      const prefMap: { [date: string]: PrefEntry } = {};
      res.data.preferences.forEach((p: any) => {
        prefMap[p.date] = { start: p.start_time || '', end: p.end_time || '', note: p.note || '' };
      });
      setPreferences(prefMap);
      setSaved(false);
    } catch (error) { console.error('Failed to load period data:', error); }
  };

  const updatePref = (date: string, field: 'start' | 'end' | 'note', value: string) => {
    setPreferences((prev) => ({
      ...prev,
      [date]: { ...(prev[date] || { start: '', end: '', note: '' }), [field]: value }
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    for (const date of dates) {
      const p = preferences[date];
      if (p && ((p.start && !p.end) || (!p.start && p.end))) {
        alert(formatMonthDay(date) + ' の開始時刻と終了時刻の両方を入力してください');
        return;
      }
    }
    setSaving(true);
    try {
      const dateArray = dates.map((date) => {
        const p = preferences[date] || { start: '', end: '', note: '' };
        return { date, start_time: p.start, end_time: p.end, note: p.note };
      });
      await preferenceApi.publicSubmit(Number(employeeId), selectedPeriod.id, dateArray);
      setSaved(true);
      loadEmployeeData();
    } catch (error) { console.error('Failed to save:', error); alert('保存に失敗しました'); }
    finally { setSaving(false); }
  };

  const isHoliday = (date: string): boolean => HOLIDAYS_2025_2026.some((h) => h.date === date);

  if (loading) return <div className="pf-loading">読み込み中...</div>;
  if (!employee) return <div className="pf-loading">従業員が見つかりません</div>;

  const filledCount = dates.filter((date) => { const p = preferences[date]; return !!(p && p.start && p.end); }).length;

  if (!selectedPeriod) {
    return (
      <div className="pf-container">
        <div className="pf-header">
          <div className="pf-store-name">南京亭</div>
          <h1>{employee.name}</h1>
          <span className="pf-tag">{employee.tag}</span>
        </div>
        <div className="pf-period-select">
          <h2>シフト希望の提出</h2>
          <p className="pf-period-hint">提出する期間を選択してください</p>
          {periods.length === 0 ? (
            <div className="pf-no-periods">利用可能な期間がありません</div>
          ) : (
            <div className="pf-period-list">
              {periods.map((period) => {
                const isEditable = period.editable !== false;
                return (
                  <div
                    key={period.id}
                    className={"pf-period-card" + (period.submitted ? " submitted" : "") + (!isEditable ? " locked" : "")}
                    onClick={() => isEditable && setSelectedPeriod(period)}
                  >
                    <div className="pf-period-dates">{formatMonthDay(period.start_date)} 〜 {formatMonthDay(period.end_date)}</div>
                    <div className="pf-period-year">{new Date(period.start_date).getFullYear()}年</div>
                    {period.submitted && <div className="pf-period-status">✓ 提出済み</div>}
                    {!isEditable && period.submitted && <div className="pf-period-locked">提出期限を過ぎています</div>}
                    {period.deadline && <div className="pf-period-deadline">提出期限: {period.deadline}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isEditable = selectedPeriod.editable !== false;

  return (
    <div className="pf-container">
      <div className="pf-header">
        <div className="pf-store-name">南京亭</div>
        <button onClick={() => { setSelectedPeriod(null); setDates([]); }} className="pf-back-btn">← 期間選択に戻る</button>
        <h1>{employee.name}</h1>
        <p className="pf-period">{formatMonthDay(selectedPeriod.start_date)} 〜 {formatMonthDay(selectedPeriod.end_date)}</p>
        <span className="pf-tag">{employee.tag}</span>
      </div>
      <div className="pf-summary"><span>入力済み: <strong>{filledCount}</strong> / {dates.length}日</span></div>
      {isEditable ? (
        <>
          <div className="pf-hint">1日は朝5時〜翌朝5時です。夜勤はそのまま翌朝の時刻を入れてください（例: 22:00〜5:00）</div>
          <div className="pf-day-list">
        {dates.map((date) => {
          const d = new Date(date);
          const day = d.getDay();
          const isSat = day === 6;
          const isSun = day === 0;
          const isHol = isHoliday(date);
          const pref = preferences[date] || { start: '', end: '', note: '' };
          let dayClass = 'pf-day-row';
          if (isSat) dayClass += ' saturday';
          if (isSun || isHol) dayClass += ' sunday';
          if (pref.start && pref.end) dayClass += ' filled';
          return (
            <div key={date} className={dayClass}>
              <div className="pf-day-label">
                <span className="pf-day-md">{d.getMonth() + 1}/{d.getDate()}</span>
                <span className="pf-day-name">{getDayName(date)}</span>
              </div>
              <div className="pf-day-times">
                <select value={pref.start} onChange={(e) => updatePref(date, 'start', e.target.value)}>
                  <option value="">開始</option>
                  {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className="pf-tilde">〜</span>
                <select value={pref.end} onChange={(e) => updatePref(date, 'end', e.target.value)}>
                  <option value="">終了</option>
                  {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <input type="text" className="pf-day-note" value={pref.note} onChange={(e) => updatePref(date, 'note', e.target.value)} placeholder="メモ" />
            </div>
          );
        })}
      </div>
      <div className="pf-submit">
        <button onClick={handleSave} disabled={saving} className={saved ? 'saved' : ''}>
          {saving ? '送信中...' : saved ? '✓ 送信済み' : '提出する'}
        </button>
      </div>
        </>
      ) : (
        <div className="pf-locked-message">
          <div className="pf-locked-icon">🔒</div>
          <p>提出期限を過ぎています</p>
          <p className="pf-locked-hint">修正が必要な場合は管理者にお問い合わせください</p>
        </div>
      )}
    </div>
  );
}

export default PreferenceForm;
