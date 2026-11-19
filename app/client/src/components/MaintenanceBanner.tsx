import { Icon } from './Icon';
import { useAuth } from '../auth/AuthContext';
import { usePublicConfig } from '../lib/config';

/** Shown on every screen while the site is in maintenance mode (administrators can still work). */
export function MaintenanceBanner() {
  const config = usePublicConfig();
  const { can } = useAuth();
  if (!config?.maintenance) return null;
  return (
    <div className="maintenance-banner" role="status">
      <Icon name="alert" size={18} />
      <span>
        {can('settings:manage')
          ? 'Maintenance mode is ON — only administrators can use the site. Turn it off in Admin → Settings.'
          : config.maintenance.message}
      </span>
    </div>
  );
}
