import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { preferenceApi } from '../services/api';
import { generateDateRange, formatMonthDay, getDayName, isSaturday, isSunday, isHoliday as checkHoliday } from '../utils/dateUtils';
import { HOLIDAYS_2025_2026 } from '../utils/holidays';
import './PreferenceForm.css';

function PreferenceForm() {
  const { employeeId, periodId } = useParams();
  const [employee, setEmployee] = useState<any>(null);
  const [period, setPeriod] = useState<any>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<{ [date: string]: boolean }>({});
  const [notes, setNotes] = useState<{ [date: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadData();
  }, [employeeId, periodId]);

  const loadData = async () => {
    try {
      const res = await preferenceApi.getPublicData(Number(employeeId), Number(periodId));
      const { employee: emp, period: per, preferences: prefs } = res.data;

      if (!emp || !per) {
        alert('データが見つかりません');
        return;
      }

      setEmployee(emp);
      setPeriod(per);
      setDates(generateDateRange(per.start_date, per.end_date));

      const prefMap: { [date: string]: boolean } = {};
      const noteMap: { [date: string]: string } = {};
      prefs.forEach((p: any) => {
        prefMap[p.date] = p.available === 1;
        noteMap[p.date] = p.note || '';
      });

      setPreferences(prefMap);
      setNotes(noteMap);
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDate = (date: string) => {
    setPreferences((prev) => ({
      ...prev,
      [date]: !prev[date]
    }));
    setSaved(false);
  };

  const setAllWeekdays = () => {
    const newPrefs: { [date: string]: boolean } = {};
    dates.forEach((date) => {
      const d = new Date(date);
      const day = d.getDay();
      newPrefs[date] = day >= 1 && day <= 5;
    });
    setPreferences(newPrefs);
    setSaved(false);
  };

  const setAllDates = () => {
    const newPrefs: { [date: string]: boolean } = {};
    dates.forEach((date) => {
      newPrefs[date] = true;
    });
    setPreferences(newPrefs);
    setSaved(false);
  };

  const clearAll = () => {
    const newPrefs: { [date: string]: boolean } = {};
    dates.forEach((date) => {
      newPrefs[date] = false;
    });
    setPreferences(newPrefs);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dateArray = dates.map((date) => ({
        date,
        available: preferences[date] ? 1 : 0,
        note: notes[date] || ''
      }));

      await preferenceApi.publicSubmit(Number(employeeId), Number(periodId), dateArray);
      setSaved(true);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const isHoliday = (date: string): boolean => {
    return HOLIDAYS_2025_2026.some((h) => h.date === date);
  };

  if (loading) {
    return <div className="pf-loading">読み込み中...</div>;
  }

  if (!employee || !period) {
    return <div className="pf-loading">データが見つかりません</div>;
  }

  const availableCount = Object.values(preferences).filter(Boolean).length;

  return (
    <div className="pf-container">
      <div className="pf-header">
        <h1>{employee.name}</h1>
        <p className="pf-period">{formatMonthDay(period.start_date)} 〜 {formatMonthDay(period.end_date)}</p>
        <span className="pf-tag">{employee.tag}</span>
      </div>

      <div className="pf-summary">
        <span>出勤可能日: <strong>{availableCount}</strong> / {dates.length}日</span>
      </div>

      <div className="pf-actions">
        <button onClick={setAllWeekdays}>平日のみ</button>
        <button onClick={setAllDates}>全日</button>
        <button onClick={clearAll}>クリア</button>
      </div>

      <div className="pf-calendar">
        {dates.map((date) => {
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
    </div>
  );
}

export default PreferenceForm;