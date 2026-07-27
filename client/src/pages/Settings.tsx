import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, shiftApi } from '../services/api';
import { DAY_NAMES, HOURS } from '../types';
import './Settings.css';

function Settings() {
  const [requiredStaff, setRequiredStaff] = useState<any[]>([]);
  const [annualHours, setAnnualHours] = useState<any[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [staffRes, hoursRes, monthlyRes] = await Promise.all([
        settingsApi.getRequiredStaff(),
        shiftApi.getAnnualHours(),
        shiftApi.getMonthlySummary()
      ]);
      setRequiredStaff(staffRes.data);
      setAnnualHours(hoursRes.data);
      setMonthlySummary(monthlyRes.data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateRequiredStaff = async (hour: number, count: number) => {
    try {
      await settingsApi.saveRequiredStaff({
        day_of_week: selectedDay,
        hour: hour,
        required_count: count
      });
      loadData();
    } catch (error) {
      console.error('Failed to update required staff:', error);
    }
  };

  const getStaffCount = (dayOfWeek: number, hour: number): number => {
    const staff = requiredStaff.find(
      (s) => s.day_of_week === dayOfWeek && s.hour === hour
    );
    return staff ? staff.required_count : 0;
  };

  const handleArchive = async () => {
    if (!confirm('3ヶ月以上前のシフトデータをアーカイブ（削除）しますか？')) return;
    setArchiving(true);
    try {
      const res = await shiftApi.archiveOldShifts(3);
      alert(res.data.archivedCount + "件の古いデータをアーカイブしました");
      loadData();
    } catch (error) {
      console.error('Archive failed:', error);
      alert('アーカイブに失敗しました');
    } finally {
      setArchiving(false);
    }
  };

  const handleRecalcMonthly = async () => {
    try {
      const periods = await shiftApi.getPeriods();
      for (const period of periods.data) {
        await shiftApi.calculateMonthlySummary(period.id);
      }
      alert('月次集計を更新しました');
      loadData();
    } catch (error) {
      console.error('Monthly calc failed:', error);
      alert('月次集計の更新に失敗しました');
    }
  };

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  return (
    <div className="settings">
      <div className="settings-header">
        <h2>設定</h2>
        <button onClick={() => navigate('/')} className="back-btn">
          ダッシュボードに戻る
        </button>
      </div>

      <div className="settings-section">
        <h3>曜日ごとの必要人数</h3>
        <div className="day-selector">
          {DAY_NAMES.map((day, index) => (
            <button
              key={index}
              className={selectedDay === index ? 'active' : ''}
              onClick={() => setSelectedDay(index)}
            >
              {day}
            </button>
          ))}
        </div>

        <div className="staff-table">
          <table>
            <thead>
              <tr>
                <th>時間</th>
                <th>必要人数</th>
              </tr>
            </thead>
            <tbody>
              {HOURS.map((hour) => (
                <tr key={hour}>
                  <td>{hour}:00</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={getStaffCount(selectedDay, hour)}
                      onChange={(e) => updateRequiredStaff(hour, parseFloat(e.target.value) || 0)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="settings-section">
        <h3>年間出勤時間</h3>
        <div className="annual-hours-list">
          {annualHours.map((emp) => (
            <div key={emp.id} className="annual-item">
              <span className="emp-name">{emp.name}</span>
              <span className="emp-tag">{emp.tag}</span>
              <span className="emp-hours">{emp.total_hours.toFixed(1)}時間</span>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="section-header">
          <h3>月次集計</h3>
          <button onClick={handleRecalcMonthly} className="recalc-btn">
            集計を更新
          </button>
        </div>
        <div className="monthly-summary-list">
          {monthlySummary.length === 0 ? (
            <div className="no-data">集計データがありません</div>
          ) : (
            monthlySummary.map((item, index) => (
              <div key={index} className="monthly-item">
                <span className="monthly-name">{item.employee_name}</span>
                <span className="monthly-tag">{item.tag}</span>
                <span className="monthly-period">{item.year_month}</span>
                <span className="monthly-hours">{item.total_hours.toFixed(1)}時間</span>
                <span className="monthly-days">{item.total_days}日</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="settings-section">
        <div className="section-header">
          <h3>データ管理</h3>
        </div>
        <div className="data-management">
          <p className="data-info">3ヶ月以上前のシフトデータをアーカイブします。月次集計は保持されます。</p>
          <button
            onClick={handleArchive}
            className="archive-btn"
            disabled={archiving}
          >
            {archiving ? 'アーカイブ中...' : '古いデータをアーカイブ'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;