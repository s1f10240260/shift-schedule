import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeApi } from '../services/api';
import { EMPLOYEE_TAGS, EmployeeTag } from '../types';
import './EmployeeManagement.css';

function EmployeeManagement() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newTag, setNewTag] = useState<EmployeeTag>('バイト');
  const [newPage, setNewPage] = useState(1);
  const [newEmail, setNewEmail] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editTag, setEditTag] = useState<EmployeeTag>('バイト');
  const [editPage, setEditPage] = useState(1);
  const [editEmail, setEditEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const response = await employeeApi.getAll();
      setEmployees(response.data);
    } catch (error) {
      console.error('Failed to load employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const addEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await employeeApi.create({
        name: newName.trim(),
        tag: newTag,
        page_number: newPage,
        email: newEmail.trim()
      });
      setNewName('');
      setNewEmail('');
      loadEmployees();
    } catch (error) {
      console.error('Failed to add employee:', error);
    }
  };

  const startEdit = (employee: any) => {
    setEditingId(employee.id);
    setEditName(employee.name);
    setEditTag(employee.tag);
    setEditPage(employee.page_number);
    setEditEmail(employee.email || '');
  };

  const saveEdit = async () => {
    if (editingId === null || !editName.trim()) return;

    try {
      await employeeApi.update(editingId, {
        name: editName.trim(),
        tag: editTag,
        page_number: editPage,
        email: editEmail.trim()
      });
      setEditingId(null);
      loadEmployees();
    } catch (error) {
      console.error('Failed to update employee:', error);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const deleteEmployee = async (id: number) => {
    if (!confirm('この従業員を削除しますか？')) return;

    try {
      await employeeApi.delete(id);
      loadEmployees();
    } catch (error) {
      console.error('Failed to delete employee:', error);
    }
  };

  const groupedEmployees = employees.reduce((acc, emp) => {
    if (!acc[emp.page_number]) {
      acc[emp.page_number] = [];
    }
    acc[emp.page_number].push(emp);
    return acc;
  }, {} as Record<number, any[]>);

  const pages = Object.keys(groupedEmployees).map(Number).sort((a, b) => a - b);

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  return (
    <div className="employee-management">
      <div className="em-header">
        <h2>従業員管理</h2>
        <button onClick={() => navigate('/')} className="back-btn">
          ダッシュボードに戻る
        </button>
      </div>

      <form onSubmit={addEmployee} className="add-form">
        <div className="form-row">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="従業員名"
            required
          />
          <select value={newTag} onChange={(e) => setNewTag(e.target.value as EmployeeTag)}>
            {EMPLOYEE_TAGS.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <select value={newPage} onChange={(e) => setNewPage(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>ページ {p}</option>
            ))}
          </select>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="メールアドレス（任意）"
          />
          <button type="submit">追加</button>
        </div>
      </form>

      <div className="employees-by-page">
        {pages.length === 0 ? (
          <div className="no-employees">
            従業員が登録されていません
          </div>
        ) : (
          pages.map((page) => (
            <div key={page} className="page-section">
              <h3>ページ {page}</h3>
              <div className="employee-list">
                {groupedEmployees[page].map((employee: any) => (
                  <div key={employee.id} className="employee-item">
                    {editingId === employee.id ? (
                      <div className="edit-form">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <select value={editTag} onChange={(e) => setEditTag(e.target.value as EmployeeTag)}>
                          {EMPLOYEE_TAGS.map((tag) => (
                            <option key={tag} value={tag}>{tag}</option>
                          ))}
                        </select>
                        <select value={editPage} onChange={(e) => setEditPage(Number(e.target.value))}>
                          {[1, 2, 3, 4, 5].map((p) => (
                            <option key={p} value={p}>ページ {p}</option>
                          ))}
                        </select>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="メールアドレス"
                        />
                        <button onClick={saveEdit}>保存</button>
                        <button onClick={cancelEdit}>キャンセル</button>
                      </div>
                    ) : (
                      <>
                        <span className="emp-name">{employee.name}</span>
                        <span className="emp-tag">{employee.tag}</span>
                        <span className="emp-email">{employee.email || 'メール未登録'}</span>
                        <div className="emp-actions">
                          <button onClick={() => startEdit(employee)}>編集</button>
                          <button onClick={() => deleteEmployee(employee.id)} className="delete-btn">削除</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EmployeeManagement;