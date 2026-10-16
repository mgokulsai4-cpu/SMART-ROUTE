import { useEffect, useMemo, useState } from 'react';

import TopBar from '../../components/TopBar';
import StatCard from '../../components/StatCard';
import Panel from '../../components/Panel';
import { adminService } from '../../services/adminService';
import { SafetyInsights } from '../../types';

const DEFAULT_INSIGHTS: SafetyInsights = {
  window_hours: 24,
  warning_count_24h: 0,
  lock_count_24h: 0,
  warning_rate_per_hour: 0,
  lock_rate_percent: 0,
  false_positive_rate_percent: 0,
  avg_recovery_seconds: 0,
  pending_escalations: 0,
  auto_reassigned_count_24h: 0,
  trend: [],
  recent_incidents: [],
};

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export default function AdminSafetyInsights() {
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<SafetyInsights>(DEFAULT_INSIGHTS);

  const loadInsights = async (windowHours: number) => {
    setLoading(true);
    try {
      const data = await adminService.getSafetyInsights(windowHours);
      setInsights(data);
    } catch {
      setInsights({ ...DEFAULT_INSIGHTS, window_hours: windowHours });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInsights(hours);
  }, [hours]);

  const maxTrend = useMemo(
    () => Math.max(1, ...insights.trend.map((row) => Math.max(row.warnings, row.locks, row.recoveries))),
    [insights.trend],
  );

  return (
    <>
      <TopBar title="Safety Insights" subtitle="Escalation monitoring and safety observability">
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          <option value={6}>Last 6h</option>
          <option value={12}>Last 12h</option>
          <option value={24}>Last 24h</option>
          <option value={48}>Last 48h</option>
          <option value={72}>Last 72h</option>
        </select>
        <button className="btn btn-primary" onClick={() => void loadInsights(hours)} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </TopBar>

      <div className="content">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <StatCard icon="⛑️" value={insights.warning_count_24h} label="Helmet Warnings" color="amber" />
          <StatCard icon="🛑" value={insights.lock_count_24h} label="Helmet Locks" color="red" />
          <StatCard icon="📤" value={insights.auto_reassigned_count_24h} label="Auto Reassigned" color="blue" />
          <StatCard icon="🚨" value={insights.pending_escalations} label="Pending Escalations" color="green" />
        </div>

        <div className="two-col">
          <Panel title={`Observability Metrics (${insights.window_hours}h)`}>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text2)' }}>Warning rate per hour</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{insights.warning_rate_per_hour.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text2)' }}>Lock rate (%)</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{insights.lock_rate_percent.toFixed(2)}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text2)' }}>False positive rate (%)</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{insights.false_positive_rate_percent.toFixed(2)}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: 'var(--text2)' }}>Avg recovery time</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatDuration(insights.avg_recovery_seconds)}</strong>
              </div>
            </div>
          </Panel>

          <Panel title="Safety Trend (Warnings · Locks · Recoveries)">
            <div style={{ padding: 16 }}>
              {insights.trend.length === 0 ? (
                <div style={{ color: 'var(--text3)', textAlign: 'center', fontSize: 12, padding: 24 }}>
                  No trend data available yet.
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, minHeight: 170 }}>
                  {insights.trend.map((point) => (
                    <div key={point.bucket} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 130 }}>
                        <div title={`Warnings: ${point.warnings}`} style={{ width: 10, borderRadius: 6, background: 'var(--amber)', height: `${Math.max(6, (point.warnings / maxTrend) * 120)}px` }} />
                        <div title={`Locks: ${point.locks}`} style={{ width: 10, borderRadius: 6, background: 'var(--red)', height: `${Math.max(6, (point.locks / maxTrend) * 120)}px` }} />
                        <div title={`Recoveries: ${point.recoveries}`} style={{ width: 10, borderRadius: 6, background: 'var(--green)', height: `${Math.max(6, (point.recoveries / maxTrend) * 120)}px` }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{point.bucket}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Recent Escalation Incidents">
          <table className="table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Order</th>
                <th>Status</th>
                <th>Warning</th>
                <th>Auto Reassign</th>
                <th>Recovery</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>Loading...</td>
                </tr>
              ) : insights.recent_incidents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>No incidents recorded.</td>
                </tr>
              ) : (
                insights.recent_incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td><strong>{incident.partner_name}</strong></td>
                    <td>{incident.order_number ? `#${incident.order_number}` : '—'}</td>
                    <td>
                      <span className={`chip ${incident.status === 'reassign_pending' ? 'pending' : incident.status === 'reassigned' ? 'danger' : 'transit'}`}>
                        {incident.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className="text-mono">{incident.warning_count_at_lock}</span>
                    </td>
                    <td>{incident.auto_reassigned ? 'Yes' : 'No'}</td>
                    <td>{formatDuration(incident.recovery_seconds || 0)}</td>
                    <td className="text-mono">{new Date(incident.unlocked_at || incident.reassigned_at || incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
