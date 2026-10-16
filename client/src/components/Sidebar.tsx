import { useAuth } from '../contexts/AuthContext';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value);
  };

  const CUSTOMER_NAV_ITEMS = [
    { icon: '🍱', label: t('nav_order_food'), path: '/customer/order' },
    { icon: '🛵', label: t('nav_track_order'), path: '/customer/track' },
  ];

  const DELIVERY_NAV_ITEMS = [
    { icon: '📦', label: t('nav_dashboard'), path: '/delivery' },
    { icon: '🗺️', label: t('nav_navigation'), path: '/delivery/nav' },
    { icon: '📷', label: t('nav_qr_scanner'), path: '/delivery/qr' },
    { icon: '⛑️', label: t('nav_safety'), path: '/delivery/safety' },
  ];

  const ADMIN_NAV_ITEMS = [
    { icon: '📊', label: t('nav_overview'), path: '/admin' },
    { icon: '📋', label: t('nav_orders'), path: '/admin/orders' },
    { icon: '🛵', label: t('nav_partners'), path: '/admin/partners' },
    { icon: '🏪', label: t('nav_restaurants'), path: '/admin/restaurants' },
    { icon: '⚠️', label: t('nav_violations'), path: '/admin/violations' },
    { icon: '📈', label: 'Safety Insights', path: '/admin/safety-insights' },
  ];


  const role = user?.role || 'customer';
  const navItems = role === 'admin'
    ? ADMIN_NAV_ITEMS
    : role === 'delivery'
      ? DELIVERY_NAV_ITEMS
      : CUSTOMER_NAV_ITEMS;

  const navSection = role === 'admin' ? t('role_admin') : role === 'delivery' ? t('role_delivery') : t('role_customer');

  return (
    <div className="sidebar">
      <div className="logo">
        <div className="logo-mark">Smart Route</div>
        <div className="logo-sub">v2.4.1 · Live</div>
      </div>

      <div className="nav-section">{navSection}</div>
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          to={item.path}
        >
          <span className="nav-icon">{item.icon}</span> {item.label}
        </NavLink>
      ))}

      <div className="role-switcher">
        <div className="role-label">{t('signed_in')}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          {user?.name || 'User'}
        </div>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: 12, justifyContent: 'center', fontSize: 12 }}
          onClick={() => { logout(); navigate('/login'); }}
        >
          {t('sign_out')}
        </button>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 20 }}>
        <select 
          value={i18n.language} 
          onChange={handleLanguageChange}
          style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="en">English</option>
          <option value="hi">हिंदी (Hindi)</option>
          <option value="te">తెలుగు (Telugu)</option>
        </select>
      </div>
    </div>
  );
}
