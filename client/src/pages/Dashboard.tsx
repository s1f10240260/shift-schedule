import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { shiftApi, employeeApi, healthApi } from '../services/api';
import { getCurrentPeriod, formatMonthDay } from '../utils/dateUtils';
import './Dashboard.css';

function Dashboard() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [backupWarning, setBackupWarning] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
    healthApi.get().then((res) => {
      if (res.data && res.data.ephemeralHost && !res.data.remotePersistence) {
        setBackupWarning(true);
      }
    }).catch(() => {});
  }, []);

  const loadData = async () => {
    try {
      const [periodsRes, empRes] = await Promise.all([
        shiftApi.getPeriods(),
        employeeApi.getAll()
      ]);
      setPeriods(periodsRes.data);
      setEmployeeCount(empRes.data.length);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewPeriod = async () => {
    const next = getCurrentPeriod();
    const startDate = new Date(next.start);
    const deadline = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 27);
    const y = deadline.getFullYear();
    const m = String(deadline.getMonth() + 1).padStart(2, '0');
    const d = String(deadline.getDate()).padStart(2, '0');
    const deadlineStr = y + '-' + m + '-' + d;

    try {
      const response = await shiftApi.createPeriod(next.start, next.end, deadlineStr);
      navigate("/shift/" + response.data.id);
    } catch (error: any) {
      if (error.response?.data?.error) {
        alert(error.response.data.error);
      } else {
        console.error('Failed to create period:', error);
      }
    }
  };

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  return (
    <div className="dashboard">
      {backupWarning && (
        <div className="backup-warning">⚠️ データの自動バックアップが未設定です。サーバーの再起動時にデータが消える可能性があります。</div>
      )}
      <div className="dashboard-header">
        <h2>シフト表一覧</h2>
        <button onClick={createNewPeriod} className="create-btn">
          新しいシフト表を作成
        </button>
      </div>

      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-value">{periods.length}</span>
          <span className="stat-label">シフト表</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{employeeCount}</span>
          <span className="stat-label">従業員</span>
        </div>
      </div>

      <div className="periods-list">
        {periods.length === 0 ? (
          <div className="no-periods">
            <p>シフト表がありません</p>
            <p>新しいシフト表を作成してください</p>
          </div>
        ) : (
          periods.map((period) => (
            <div
              key={period.id}
              className="period-card"
              onClick={() => navigate("/shift/" + period.id)}
            >
              <div className="period-dates">
                {formatMonthDay(period.start_date)} 〜 {formatMonthDay(period.end_date)}
              </div>
              <div className="period-year">
                {new Date(period.start_date).getFullYear()}年
              </div>
            </div>
          ))
        )}
      </div>

      <div className="dashboard-nav">
        <button onClick={() => navigate('/employees')} className="nav-btn">
          従業員管理
        </button>
        <button onClick={() => navigate('/settings')} className="nav-btn">
          設定
        </button>
        {periods.length > 0 && (
          <button onClick={() => navigate('/qrcodes/' + periods[0].id)} className="nav-btn qr-btn">
            QRコード
          </button>
        )}
      </div>
    </div>
  );
}

export default Dashboard;