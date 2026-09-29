import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { emailApi, shiftApi } from '../services/api';
import { EMPLOYEE_TAGS } from '../types';
import './ShortageEmail.css';

interface VacancySlot {
  date: string;
  startTime: string;
  endTime: string;
  note: string;
}

function formatDateLabel(date: string): string {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return (d.getMonth() + 1) + '/' + d.getDate() + '(' + days[d.getDay()] + ')';
}

function formatVacancyLines(slots: VacancySlot[]): string {
  return slots
    .filter((v) => v.date && (v.startTime || v.endTime || v.note))
    .map((v) => {
      const time =
        v.startTime && v.endTime
          ? v.startTime + '〜' + v.endTime
          : v.startTime
            ? v.startTime + '〜'
            : v.endTime
              ? '〜' + v.endTime
              : '時間応相談';
      let line = '・' + formatDateLabel(v.date) + ' ' + time;
      if (v.note) line += '　（' + v.note + '）';
      return line;
    })
    .join('\n');
}

function ShortageEmail() {
  const { periodId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [period, setPeriod] = useState<any>(null);
  const [autoShortages, setAutoShortages] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([...EMPLOYEE_TAGS]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [vacancies, setVacancies] = useState<VacancySlot[]>([
    { date: '', startTime: '', endTime: '', note: '' }
  ]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sendMode, setSendMode] = useState<'individual' | 'bcc'>('individual');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | ''>('');
  const [templateName, setTemplateName] = useState('');
  const [templateMsg, setTemplateMsg] = useState('');

  useEffect(() => {
    loadData();
  }, [periodId]);

  const loadData = async () => {
    try {
      const [shortRes, periodsRes, settingsRes, tmplRes] = await Promise.all([
        emailApi.getShortages(Number(periodId)),
        shiftApi.getPeriods(),
        emailApi.getSettings().catch(() => ({ data: { configured: false } })),
        emailApi.getTemplates().catch(() => ({ data: [] }))
      ]);
      const data = shortRes.data;
      setPeriod(data.period);
      setAutoShortages(data.shortages || []);
      setEmployees(data.employees || []);
      setConfigured(Boolean(settingsRes.data?.configured));
      setTemplates(tmplRes.data || []);
      const current = periodsRes.data.find((p: any) => p.id === Number(periodId)) || data.period;
      if (current) {
        setPeriod(current);
        const label = formatDateLabel(current.start_date) + '〜' + formatDateLabel(current.end_date);
        setSubject('【代打募集】' + label + ' シフト欠員のご相談');
      }
    } catch (e) {
      console.error(e);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleEmployee = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const updateVacancy = (index: number, field: keyof VacancySlot, value: string) => {
    setVacancies((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  };

  const addVacancy = () => {
    setVacancies((prev) => [...prev, { date: '', startTime: '', endTime: '', note: '' }]);
  };

  const removeVacancy = (index: number) => {
    setVacancies((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const appendToBody = (text: string) => {
    if (!text.trim()) return;
    setBody((prev) => (prev.trim() ? prev.replace(/\s*$/, '') + '\n\n' + text : text));
  };

  const applyTemplate = (id: number) => {
    setSelectedTemplateId(id);
    const t = templates.find((x) => Number(x.id) === Number(id));
    if (!t) return;
    setSubject(t.subject || '');
    setBody(t.body || '');
    setTemplateName(t.name || '');
    setTemplateMsg('「' + t.name + '」を読み込みました');
  };

  const saveAsTemplate = async () => {
    const name = templateName.trim() || (selectedTemplateId
      ? templates.find((t) => Number(t.id) === Number(selectedTemplateId))?.name
      : '');
    if (!name) {
      setTemplateMsg('テンプレート名を入力してください');
      return;
    }
    try {
      const payload: any = { name, subject, body };
      if (selectedTemplateId) payload.id = Number(selectedTemplateId);
      await emailApi.saveTemplate(payload);
      const res = await emailApi.getTemplates();
      setTemplates(res.data || []);
      setTemplateMsg(selectedTemplateId ? 'テンプレートを更新しました' : 'テンプレートを保存しました');
    } catch (e: any) {
      setTemplateMsg(e?.response?.data?.error || '保存に失敗しました');
    }
  };

  const deleteTemplate = async () => {
    if (!selectedTemplateId) return;
    if (!confirm('このテンプレートを削除しますか？')) return;
    try {
      await emailApi.deleteTemplate(Number(selectedTemplateId));
      setSelectedTemplateId('');
      setTemplateName('');
      const res = await emailApi.getTemplates();
      setTemplates(res.data || []);
      setTemplateMsg('削除しました');
    } catch (e: any) {
      setTemplateMsg(e?.response?.data?.error || '削除に失敗しました');
    }
  };

  const insertVacancies = () => {
    const lines = formatVacancyLines(vacancies);
    if (!lines) {
      setError('挿入できる募集枠がありません。日付などを入力してください。');
      return;
    }
    setError('');
    appendToBody('【募集している時間帯】\n' + lines);
  };

  const insertAutoShortages = () => {
    if (autoShortages.length === 0) return;
    const lines = autoShortages
      .map((s: any) => '・' + s.label + '　不足' + s.deficit + '名')
      .join('\n');
    appendToBody('【不足している時間帯（参考）】\n' + lines);
  };

  const filteredEmployees = employees.filter((e) => selectedTags.includes(e.tag));
  // Keep individual checks in sync with the visible role filter
  const visibleIds = new Set(filteredEmployees.map((e) => e.id));
  const effectiveSelectedIds = selectedIds.filter((id) => visibleIds.has(id));
  const recipients = filteredEmployees
    .filter((e) => (effectiveSelectedIds.length > 0 ? effectiveSelectedIds.includes(e.id) : true))
    .filter((e) => e.email && String(e.email).trim());

  const missingEmailCount = filteredEmployees.filter(
    (e) => !e.email || !String(e.email).trim()
  ).length;

  const handleSend = async () => {
    if (!subject.trim()) {
      setError('件名を入力してください');
      return;
    }
    if (!body.trim()) {
      setError('本文を入力してください');
      return;
    }
    if (recipients.length === 0) {
      setError('送信対象がいません。ロール選択とメールアドレス登録を確認してください。');
      return;
    }

    const ok = confirm(
      recipients.length + '名にメールを送信します。\n' +
      '送信モード: ' + (sendMode === 'bcc' ? 'BCC一括' : '個別送信') + '\n\n' +
      'よろしいですか？'
    );
    if (!ok) return;

    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await emailApi.sendBulk({
        period_id: Number(periodId),
        tags: effectiveSelectedIds.length > 0 ? undefined : selectedTags,
        employee_ids: effectiveSelectedIds.length > 0 ? effectiveSelectedIds : undefined,
        subject: subject.trim(),
        body,
        send_mode: sendMode
      });
      setResult(res.data);
      if (!res.data.success) {
        setError('一部の送信に失敗しました');
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || '送信に失敗しました');
    } finally {
      setSending(false);
    }
  };

  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(body);
      alert('本文をコピーしました');
    } catch {
      alert('コピーに失敗しました');
    }
  };

  if (loading) {
    return <div className="loading">読み込み中...</div>;
  }

  return (
    <div className="shortage-email">
      <div className="se-header">
        <button onClick={() => navigate('/shift/' + periodId)} className="back-btn">
          シフト編集に戻る
        </button>
        <h2>欠員補充メール一斉送信</h2>
        {period && (
          <span className="se-period">
            {period.start_date} 〜 {period.end_date}
          </span>
        )}
      </div>

      <p className="se-lead">
        本文は自由に書いてください。募集枠の入力欄は、文章に挿入するための補助です（書かなくても送信できます）。
      </p>

      {!configured && (
        <div className="se-warn">
          メール送信にはSMTP設定が必要です。
          <button type="button" onClick={() => navigate('/settings')}>設定画面でメール設定を開く</button>
        </div>
      )}

      {error && <div className="se-error">{error}</div>}

      <div className="se-grid">
        <section className="se-panel">
          <h3>1. 本文（自由記述）</h3>

          <div className="se-template-bar">
            <label className="se-field se-template-field">
              テンプレート
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') {
                    setSelectedTemplateId('');
                    setTemplateName('');
                    setTemplateMsg('');
                  } else {
                    applyTemplate(Number(v));
                  }
                }}
              >
                <option value="">（新規）</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label className="se-field se-template-field">
              テンプレ名
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="例）夜勤代打のお願い"
              />
            </label>
            <div className="se-template-actions">
              <button type="button" onClick={saveAsTemplate}>
                {selectedTemplateId ? '更新' : '保存'}
              </button>
              {selectedTemplateId && (
                <button type="button" className="danger" onClick={deleteTemplate}>
                  削除
                </button>
              )}
            </div>
            {templateMsg && <p className="se-template-msg">{templateMsg}</p>}
          </div>

          <label className="se-field">
            件名
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="件名を入力"
            />
          </label>
          <label className="se-field">
            本文
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={16}
              placeholder={'例）\nお疲れさまです。\n○日の夜、急な欠勤が出たため代打を探しています。\n対応できる方はこのメールに返信してください。'}
            />
          </label>
          <div className="se-insert-row">
            <button type="button" onClick={insertVacancies}>募集枠を本文に挿入</button>
            {autoShortages.length > 0 && (
              <button type="button" onClick={insertAutoShortages}>
                自動不足枠（参考）を挿入
              </button>
            )}
            <button type="button" onClick={copyBody}>本文をコピー</button>
          </div>

          <h3 className="se-subhead">募集枠メモ（任意・挿入用）</h3>
          {vacancies.map((v, i) => (
            <div key={i} className="se-vacancy-row">
              <input
                type="date"
                value={v.date}
                onChange={(e) => updateVacancy(i, 'date', e.target.value)}
              />
              <input
                type="text"
                value={v.startTime}
                onChange={(e) => updateVacancy(i, 'startTime', e.target.value)}
                placeholder="開始"
              />
              <input
                type="text"
                value={v.endTime}
                onChange={(e) => updateVacancy(i, 'endTime', e.target.value)}
                placeholder="終了"
              />
              <input
                type="text"
                value={v.note}
                onChange={(e) => updateVacancy(i, 'note', e.target.value)}
                placeholder="メモ"
                className="note-input"
              />
              <button type="button" onClick={() => removeVacancy(i)} disabled={vacancies.length <= 1}>
                削除
              </button>
            </div>
          ))}
          <button type="button" className="se-add-btn" onClick={addVacancy}>
            ＋ 行を追加
          </button>
        </section>

        <section className="se-panel">
          <h3>2. ロールを選択して送信先を決める</h3>
          <div className="se-tags">
            {EMPLOYEE_TAGS.map((tag) => (
              <label
                key={tag}
                className={'se-tag ' + (selectedTags.includes(tag) ? 'active' : '')}
              >
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                />
                {tag}
              </label>
            ))}
          </div>

          <div className="se-recipient-toolbar">
            <span>対象: {recipients.length}名に送信</span>
            <div>
              <button
                type="button"
                onClick={() => setSelectedIds(filteredEmployees.filter((e) => e.email).map((e) => e.id))}
              >
                表示中を全選択
              </button>
              <button type="button" onClick={() => setSelectedIds([])}>
                個別選択を解除
              </button>
            </div>
          </div>
          {missingEmailCount > 0 && (
            <p className="se-warn">メール未登録: {missingEmailCount}名（送信対象から除外されます）</p>
          )}

          <div className="se-employee-list">
            {filteredEmployees.length === 0 ? (
              <p className="se-empty">選択したロールに該当する従業員がいません</p>
            ) : (
              filteredEmployees.map((emp) => {
                const hasMail = emp.email && String(emp.email).trim();
                const isTarget =
                  hasMail && (selectedIds.length === 0 || selectedIds.includes(emp.id));
                return (
                  <label
                    key={emp.id}
                    className={
                      'se-emp ' +
                      (!hasMail ? 'no-mail' : '') +
                      (isTarget ? ' target' : '')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      disabled={!hasMail}
                    />
                    <span className="emp-name">{emp.name}</span>
                    <span className="emp-tag">{emp.tag}</span>
                    <span className="emp-email">{hasMail ? emp.email : 'メール未登録'}</span>
                  </label>
                );
              })
            )}
          </div>
          <p className="se-hint">
            チェックを付けた場合は「選択した人だけ」、どれも付けていない場合は「選択したロール全員」に送信します。
          </p>
        </section>

        <section className="se-panel">
          <h3>3. 送信</h3>
          <label className="se-field">
            送信モード
            <select
              value={sendMode}
              onChange={(e) => setSendMode(e.target.value as 'individual' | 'bcc')}
            >
              <option value="individual">個別送信（「○○さん」を付けます）</option>
              <option value="bcc">BCC一括（本文はそのまま）</option>
            </select>
          </label>
          <p className="se-hint">
            個別送信のときだけ、本文の先頭に「お名前 さん」が付きます。文章は送信者が書いたものがそのまま届きます。
          </p>

          <button
            className="se-send-btn"
            onClick={handleSend}
            disabled={sending || recipients.length === 0 || !configured || !body.trim()}
          >
            {sending ? '送信中...' : recipients.length + '名に一斉送信'}
          </button>

          {result && (
            <div className="se-result">
              <p>
                送信結果: 成功 {result.successCount}件 / 失敗 {result.failCount}件
              </p>
              <ul>
                {(result.results || []).map((r: any, i: number) => (
                  <li key={i} className={r.ok ? 'ok' : 'ng'}>
                    {r.name} &lt;{r.email}&gt; {r.ok ? '✓' : '✗ ' + (r.error || '')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ShortageEmail;
