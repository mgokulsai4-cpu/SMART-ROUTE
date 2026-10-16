import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { extractErrorMessage } from '../../utils/errors';
import { useTranslation } from 'react-i18next';

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, role);
      const routes: Record<string, string> = { customer: '/customer', delivery: '/delivery', admin: '/admin' };
      navigate(routes[role]);
    } catch (err) {
      setError(extractErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-layout">
      <div className="login-left">
        <div className="login-brand">Smart<br />Route</div>
        <div className="login-tagline">
          Intelligent delivery management with real-time tracking, oye routing, and safety monitoring.
        </div>
        <div className="login-feature"><div className="login-feature-dot" /> Smart Route Optimization with food-priority logic</div>
        <div className="login-feature"><div className="login-feature-dot" /> Live GPS tracking with 5-second updates</div>
        <div className="login-feature"><div className="login-feature-dot" /> QR-based privacy protection for customer addresses</div>
        <div className="login-feature"><div className="login-feature-dot" /> Helmet detection & speed monitoring</div>
        <div className="login-feature"><div className="login-feature-dot" /> Multi-language: English, Hindi, Telugu</div>
      </div>
      <div className="login-right">
        <div className="login-form">
          <div className="login-form-title">{t('welcome_back')}</div>
          <div className="login-form-sub">{t('sign_in_sub')}</div>
          {error && <div style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>{t('role')}</label>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                <option value="customer">{t('role_customer')}</option>
                <option value="delivery">{t('role_delivery')}</option>
                <option value="admin">{t('role_admin')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('email')}</label>
              <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('password')}</label>
              <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
              {loading ? t('loading') : t('sign_in')}
            </button>
          </form>
          <div className="login-switch">
            {t('dont_have_account')} <Link to="/register">{t('register')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
