import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { preferenceApi } from '../services/api';
import { generateDateRange, formatMonthDay, getDayName } from '../utils/dateUtils';
import { HOLIDAYS_2025_2026 } from '../utils/holidays';
import './PreferenceForm.css';

function PreferenceForm() {
  const { employeeId } = useParams();
  const [employee, setEmployee] = useState<any>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [weekDates, setWeekDates] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<{ [date: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => { loadEmployeeData(); }, [employeeId]);
  useEffect(() => { if (selectedPeriod) loadPeriodData(); }, [selectedPeriod]);
  useEffect(() => {
    const startIdx = weekOffset * 7;
    setWeekDates(dates.slice(startIdx, startIdx + 7));
  }, [weekOffset, dates]);

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
      setWeekOffset(0);
      const prefMap: { [date: string]: boolean } = {};
      res.data.preferences.forEach((p: any) => { prefMap[p.date] = p.available === 1; });
      setPreferences(prefMap);
      setSaved(false);
    } catch (error) { console.error('Failed to load period data:', error); }
  };

  const toggleDate = (date: string) => {
    setPreferences((prev) => ({ ...prev, [date]: !prev[date] }));
    setSaved(false);
  };

  const setAllWeekdays = () => {
    const newPrefs: { [date: string]: boolean } = {};
    dates.forEach((date) => { const d = new Date(date); newPrefs[date] = d.getDay() >= 1 && d.getDay() <= 5; });
    setPreferences(newPrefs);
    setSaved(false);
  };

  const setAllDates = () => {
    const newPrefs: { [date: string]: boolean } = {};
    dates.forEach((date) => { newPrefs[date] = true; });
    setPreferences(newPrefs);
    setSaved(false);
  };

  const clearAll = () => {
    const newPrefs: { [date: string]: boolean } = {};
    dates.forEach((date) => { newPrefs[date] = false; });
    setPreferences(newPrefs);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dateArray = dates.map((date) => ({ date, available: preferences[date] ? 1 : 0, note: '' }));
      await preferenceApi.publicSubmit(Number(employeeId), selectedPeriod.id, dateArray);
      setSaved(true);
      loadEmployeeData();
    } catch (error) { console.error('Failed to save:', error); alert('保存に失敗しました'); }
    finally { setSaving(false); }
  };

  const isHoliday = (date: string): boolean => HOLIDAYS_2025_2026.some((h) => h.date === date);

  if (loading) return <div className="pf-loading">読み込み中...</div>;
  if (!employee) return <div className="pf-loading">従業員が見つかりません</div>;

  const availableCount = dates.length > 0 ? Object.values(preferences).filter(Boolean).length : 0;
  const totalWeeks = Math.ceil(dates.length / 7);

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
      <div className="pf-summary"><span>出勤可能日: <strong>{availableCount}</strong> / {dates.length}日</span></div>
      {isEditable ? (
        <>
          <div className="pf-actions">
            <button onClick={setAllWeekdays}>平日のみ</button>
            <button onClick={setAllDates}>全日</button>
            <button onClick={clearAll}>クリア</button>
          </div>
          {totalWeeks > 1 && (
            <div className="pf-week-nav">
              <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}>← 前週</button>
              <span>{formatMonthDay(weekDates[0])} 〜 {formatMonthDay(weekDates[weekDates.length - 1])}</span>
              <button onClick={() => setWeekOffset(Math.min(totalWeeks - 1, weekOffset + 1))} disabled={weekOffset >= totalWeeks - 1}>次週 →</button>
            </div>
          )}
          <div className="pf-calendar">
        {weekDates.map((date) => {
          const d = new Date(date);
          const day = d.getDay();
          const isSat = day === 6;
          const isSun = day === 0;
          const isHol = isHoliday(date);
          const available = preferences[date] !== false;
          let dayClass = 'pf-day';
          if (isSat) dayClass += ' saturday';
          if (isSun || isHol) dayClass += ' sunday';
          if (available) dayClass += ' available';
          return (
            <div key={date} className={dayClass} onClick={() => toggleDate(date)}>
              <div className="pf-date-num">{d.getMonth() + 1}/{d.getDate()}</div>
              <div className="pf-date-day">{getDayName(date)}</div>
              <div className="pf-check">{available ? '◯' : '✕'}</div>
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
