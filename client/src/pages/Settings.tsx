import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsApi, shiftApi, emailApi } from '../services/api';
import { DAY_NAMES, HOURS } from '../types';
import './Settings.css';

function Settings() {
  const [requiredStaff, setRequiredStaff] = useState<any[]>([]);
  const [annualHours, setAnnualHours] = useState<any[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [smtp, setSmtp] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    from_name: '',
    from_email: ''
  });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [smtpMsg, setSmtpMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [staffRes, hoursRes, monthlyRes, emailRes] = await Promise.all([
        settingsApi.getRequiredStaff(),
        shiftApi.getAnnualHours(),
        shiftApi.getMonthlySummary(),
        emailApi.getSettings().catch(() => ({ data: null }))
      ]);
      setRequiredStaff(staffRes.data);
      setAnnualHours(hoursRes.data);
      setMonthlySummary(monthlyRes.data);
      if (emailRes.data) {
        setSmtp({
          smtp_host: emailRes.data.smtp_host || '',
          smtp_port: emailRes.data.smtp_port || 587,
          smtp_user: emailRes.data.smtp_user || '',
          smtp_pass: emailRes.data.smtp_pass || '',
          from_name: emailRes.data.from_name || '',
          from_email: emailRes.data.from_email || ''
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSmtp = async () => {
    setSmtpSaving(true);
    setSmtpMsg('');
    try {
      await emailApi.saveSettings(smtp);
      setSmtpMsg('メール設定を保存しました');
    } catch (e: any) {
      setSmtpMsg(e?.response?.data?.error || '保存に失敗しました');
    } finally {
      setSmtpSaving(false);
    }
  };

  const sendTestMail = async () => {
    if (!testTo.trim()) {
      setSmtpMsg('テスト送信先を入力してください');
      return;
    }
    setSmtpMsg('');
    try {
      await emailApi.sendTest(testTo.trim());
      setSmtpMsg('テストメールを送信しました');
    } catch (e: any) {
      setSmtpMsg(e?.response?.data?.error || 'テスト送信に失敗しました');
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
        <h3>メール送信設定（SMTP）</h3>
        <p className="data-info">
          欠員補充メールの一斉送信に使用します。Gmailの場合は「アプリパスワード」をパスワード欄に入力してください（無料）。
        </p>
        <div className="smtp-form">
          <label>
            SMTPサーバー
            <input
              type="text"
              value={smtp.smtp_host}
              onChange={(e) => setSmtp({ ...smtp, smtp_host: e.target.value })}
              placeholder="smtp.gmail.com"
            />
          </label>
          <label>
            ポート
            <input
              type="number"
              value={smtp.smtp_port}
              onChange={(e) => setSmtp({ ...smtp, smtp_port: Number(e.target.value) || 587 })}
              placeholder="587"
            />
          </label>
          <label>
            ユーザー名
            <input
              type="text"
              value={smtp.smtp_user}
              onChange={(e) => setSmtp({ ...smtp, smtp_user: e.target.value })}
              placeholder="example@gmail.com"
            />
          </label>
          <label>
            パスワード / アプリパスワード
            <input
              type="password"
              value={smtp.smtp_pass}
              onChange={(e) => setSmtp({ ...smtp, smtp_pass: e.target.value })}
              placeholder="••••••••"
            />
          </label>
          <label>
            送信者名
            <input
              type="text"
              value={smtp.from_name}
              onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })}
              placeholder="南京亭 〇〇店"
            />
          </label>
          <label>
            送信元メール（任意）
            <input
              type="email"
              value={smtp.from_email}
              onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })}
              placeholder="未指定ならユーザー名と同じ"
            />
          </label>
          <div className="smtp-actions">
            <button onClick={saveSmtp} disabled={smtpSaving}>
              {smtpSaving ? '保存中...' : 'メール設定を保存'}
            </button>
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="テスト送信先"
            />
            <button onClick={sendTestMail}>テスト送信</button>
          </div>
          {smtpMsg && <p className="smtp-msg">{smtpMsg}</p>}
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