import TopBar from '../../components/TopBar';
import Panel from '../../components/Panel';
import RestaurantMap from '../../components/RestaurantMap';
import { restaurants } from '../../data/restaurants';
import { useTranslation } from 'react-i18next';

export default function AdminRestaurants() {
  const { t } = useTranslation();
  return (
    <>
      <TopBar
        title={t('nav_restaurants')}
        subtitle={`${restaurants.length} restaurants plotted across Vizianagaram Zone`}
      />
      <div className="content">
        <Panel title="All Restaurants">
          <RestaurantMap restaurants={restaurants} />
        </Panel>
      </div>
    </>
  );
}
