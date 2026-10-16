import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type TabKey = 'home' | 'track' | 'profile';
type Category = 'All' | 'Biryani' | 'Pizza' | 'Burgers' | 'Healthy' | 'Desserts' | 'Drinks';

interface Restaurant {
  id: number;
  name: string;
  cuisine: string;
  category: Exclude<Category, 'All'>;
  rating: number;
  etaMinutes: number;
  distance: string;
  fee: string;
  badge: string;
  accent: string;
  description: string;
  menu: string[];
}

interface TrackingStep {
  title: string;
  detail: string;
  emoji: string;
}

interface StatCardProps {
  value: string;
  label: string;
  tone: string;
}

interface RestaurantCardProps {
  restaurant: Restaurant;
  selected: boolean;
  onSelect: () => void;
  onOrder: () => void;
}

interface CategoryChipProps {
  label: Category;
  active: boolean;
  onPress: () => void;
}

interface TabButtonProps {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}

const CATEGORIES: Category[] = ['All', 'Biryani', 'Pizza', 'Burgers', 'Healthy', 'Desserts', 'Drinks'];

const RESTAURANTS: Restaurant[] = [
  {
    id: 1,
    name: 'Biryani Street',
    cuisine: 'Hyderabadi Biryani',
    category: 'Biryani',
    rating: 4.9,
    etaMinutes: 18,
    distance: '1.2 km',
    fee: 'Free delivery',
    badge: 'Top rated',
    accent: '#f97316',
    description: 'Slow-cooked biryani with saffron rice, tender chicken, and fiery salan.',
    menu: ['Chicken Biryani', 'Double Ka Meetha', 'Mirchi Ka Salan'],
  },
  {
    id: 2,
    name: 'Crust & Slice',
    cuisine: 'Wood-fired Pizza',
    category: 'Pizza',
    rating: 4.7,
    etaMinutes: 24,
    distance: '2.0 km',
    fee: '₹39 delivery',
    badge: 'Cheesy favorite',
    accent: '#38bdf8',
    description: 'Crispy hand-tossed dough topped with fresh sauce, cheese, and basil.',
    menu: ['Margherita', 'Farmhouse', 'Peri Peri Paneer'],
  },
  {
    id: 3,
    name: 'Burger Dock',
    cuisine: 'Smash Burgers',
    category: 'Burgers',
    rating: 4.6,
    etaMinutes: 16,
    distance: '0.8 km',
    fee: 'Free delivery',
    badge: 'Quick bite',
    accent: '#22c55e',
    description: 'Juicy patties, toasted buns, and loaded fries made for quick delivery.',
    menu: ['Classic Smash', 'Chicken Crunch', 'Loaded Fries'],
  },
  {
    id: 4,
    name: 'Green Bowl',
    cuisine: 'Healthy Bowls',
    category: 'Healthy',
    rating: 4.8,
    etaMinutes: 20,
    distance: '1.5 km',
    fee: 'Free delivery',
    badge: 'Fresh pick',
    accent: '#14b8a6',
    description: 'Protein bowls, salads, and wraps with a bright, fresh taste.',
    menu: ['Protein Bowl', 'Avocado Wrap', 'Berry Smoothie'],
  },
  {
    id: 5,
    name: 'Sweet Cloud',
    cuisine: 'Desserts',
    category: 'Desserts',
    rating: 4.9,
    etaMinutes: 14,
    distance: '0.6 km',
    fee: '₹19 delivery',
    badge: 'Best seller',
    accent: '#ec4899',
    description: 'Brownies, waffles, and cold desserts that land fast and fresh.',
    menu: ['Nutella Waffle', 'Chocolate Brownie', 'Vanilla Sundae'],
  },
  {
    id: 6,
    name: 'Spice Route',
    cuisine: 'Indian Classics',
    category: 'Drinks',
    rating: 4.5,
    etaMinutes: 22,
    distance: '1.8 km',
    fee: '₹29 delivery',
    badge: 'Popular',
    accent: '#a855f7',
    description: 'North Indian meals with refreshing drinks and comfort combos.',
    menu: ['Thali Combo', 'Masala Chaas', 'Gulab Jamun'],
  },
];

const TRACKING_STEPS: TrackingStep[] = [
  { title: 'Order placed', detail: 'Restaurant confirmed the request', emoji: '🧾' },
  { title: 'Picked up', detail: 'Rider collected the parcel', emoji: '🛵' },
  { title: 'On the road', detail: 'Live location shared with customer', emoji: '📍' },
  { title: 'Delivered', detail: 'Enjoy your meal', emoji: '✅' },
];

const HOME_STATS = [
  { value: '4.8', label: 'Avg rating', tone: '#f97316' },
  { value: '18 min', label: 'Fast delivery', tone: '#22c55e' },
  { value: '24/7', label: 'Live support', tone: '#38bdf8' },
];

const PROFILE_STATS = [
  { value: '128', label: 'Orders', tone: '#f97316' },
  { value: '₹2.4k', label: 'Saved', tone: '#22c55e' },
  { value: '4.9', label: 'Rider rating', tone: '#38bdf8' },
];

function StatCard({ value, label, tone }: StatCardProps) {
  return (
    <View style={[styles.statCard, { borderColor: tone }]}>
      <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CategoryChip({ label, active, onPress }: CategoryChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.categoryChip, active && styles.categoryChipActive]}
    >
      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function RestaurantCard({ restaurant, selected, onSelect, onOrder }: RestaurantCardProps) {
  return (
    <Pressable
      onPress={onSelect}
      style={[
        styles.restaurantCard,
        selected && { borderColor: restaurant.accent, backgroundColor: '#111827' },
      ]}
    >
      <View style={[styles.restaurantAccent, { backgroundColor: restaurant.accent }]} />
      <View style={styles.restaurantTopRow}>
        <View style={styles.restaurantTitleWrap}>
          <Text style={styles.restaurantName}>{restaurant.name}</Text>
          <Text style={styles.restaurantCuisine}>{restaurant.cuisine}</Text>
        </View>
        <View style={[styles.ratingBadge, { borderColor: restaurant.accent }]}>
          <Text style={styles.ratingText}>★ {restaurant.rating.toFixed(1)}</Text>
        </View>
      </View>
      <Text style={styles.restaurantDesc}>{restaurant.description}</Text>
      <View style={styles.menuRow}>
        {restaurant.menu.map((item) => (
          <View key={item} style={styles.menuPill}>
            <Text style={styles.menuPillText}>{item}</Text>
          </View>
        ))}
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{restaurant.distance}</Text>
        <Text style={styles.metaText}>{restaurant.fee}</Text>
        <Text style={styles.metaText}>{restaurant.etaMinutes} min</Text>
      </View>
      <Pressable
        onPress={onOrder}
        style={[styles.orderButton, { backgroundColor: restaurant.accent }]}
      >
        <Text style={styles.orderButtonText}>Order now</Text>
      </Pressable>
    </Pressable>
  );
}

function TabButton({ icon, label, active, onPress }: TabButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function RouteVisualizer({ stage }: { stage: number }) {
  const safeStage = Math.max(0, Math.min(stage, TRACKING_STEPS.length - 1));
  const progress = (safeStage / (TRACKING_STEPS.length - 1)) * 100;

  return (
    <View style={styles.routeCard}>
      <View style={styles.routeHeader}>
        <Text style={styles.sectionLabel}>Live route</Text>
        <Text style={styles.liveTag}>GPS ON</Text>
      </View>

      <View style={styles.routeTrack}>
        <View style={styles.routeRail} />
        <View style={[styles.routeFill, { width: `${progress}%` }]} />
        <View style={[styles.routeScooter, { left: `${progress}%` }]}>
          <Text style={styles.routeScooterText}>🛵</Text>
        </View>

        {TRACKING_STEPS.map((step, index) => {
          const complete = index <= safeStage;
          return (
            <View
              key={step.title}
              style={[
                styles.routeNode,
                { left: `${(index / (TRACKING_STEPS.length - 1)) * 100}%` },
                complete && styles.routeNodeActive,
              ]}
            >
              <Text style={styles.routeNodeText}>{step.emoji}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.routeLegend}>
        {TRACKING_STEPS.map((step, index) => {
          const complete = index < safeStage;
          const active = index === safeStage;
          return (
            <View key={step.title} style={styles.legendRow}>
              <View style={[styles.legendDot, complete && styles.legendDotDone, active && styles.legendDotActive]} />
              <View style={styles.legendTextBlock}>
                <Text style={[styles.legendTitle, active && styles.legendTitleActive]}>{step.title}</Text>
                <Text style={styles.legendDetail}>{step.detail}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number>(1);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [orderStage, setOrderStage] = useState(0);

  const selectedRestaurant = useMemo(
    () => RESTAURANTS.find((restaurant) => restaurant.id === selectedRestaurantId) ?? RESTAURANTS[0],
    [selectedRestaurantId],
  );

  const activeRestaurant = useMemo(
    () => (activeOrderId ? RESTAURANTS.find((restaurant) => restaurant.id === activeOrderId) ?? null : null),
    [activeOrderId],
  );

  const filteredRestaurants = useMemo(() => {
    const query = search.trim().toLowerCase();

    return RESTAURANTS
      .filter((restaurant) => selectedCategory === 'All' || restaurant.category === selectedCategory)
      .filter((restaurant) => {
        if (!query) return true;
        return [restaurant.name, restaurant.cuisine, restaurant.description, ...restaurant.menu]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.rating - a.rating);
  }, [search, selectedCategory]);

  useEffect(() => {
    if (!activeRestaurant || orderStage >= TRACKING_STEPS.length - 1) return;

    const timer = setInterval(() => {
      setOrderStage((current) => Math.min(current + 1, TRACKING_STEPS.length - 1));
    }, 4500);

    return () => clearInterval(timer);
  }, [activeRestaurant, orderStage]);

  const progress = activeRestaurant
    ? Math.round((orderStage / (TRACKING_STEPS.length - 1)) * 100)
    : 0;

  const liveEta = activeRestaurant
    ? orderStage >= TRACKING_STEPS.length - 1
      ? 0
      : Math.max(4, activeRestaurant.etaMinutes - orderStage * 5)
    : 0;

  const liveSpeed = activeRestaurant ? 24 + orderStage * 6 : 0;

  const startOrder = (restaurant: Restaurant) => {
    setSelectedRestaurantId(restaurant.id);
    setActiveOrderId(restaurant.id);
    setOrderStage(0);
    setActiveTab('track');
  };

  const advanceTracking = () => {
    if (!activeRestaurant) return;
    setOrderStage((current) => Math.min(current + 1, TRACKING_STEPS.length - 1));
  };

  const reorder = () => {
    if (!activeRestaurant) return;
    setOrderStage(0);
    setActiveTab('home');
  };

  const callRider = () => {
    Alert.alert('Calling rider', 'This is a demo app. Connect your backend to call the rider.');
  };

  const renderHome = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.brand}>oye</Text>
            <Text style={styles.heroTitle}>Food delivery that feels fast.</Text>
          </View>
          <View style={styles.locationPill}>
            <Text style={styles.locationPillText}>📍 Hyderabad</Text>
          </View>
        </View>

        <Text style={styles.heroSubtitle}>
          Order food, track live delivery, and keep the rider on the fastest route.
        </Text>

        <View style={styles.statsRow}>
          {HOME_STATS.map((item) => (
            <StatCard key={item.label} value={item.value} label={item.label} tone={item.tone} />
          ))}
        </View>
      </View>

      <View style={styles.searchCard}>
        <Text style={styles.sectionLabel}>Find food</Text>
        <TextInput
          placeholder="Search meals or restaurants"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        {CATEGORIES.map((category) => (
          <CategoryChip
            key={category}
            label={category}
            active={selectedCategory === category}
            onPress={() => setSelectedCategory(category)}
          />
        ))}
      </ScrollView>

      <View style={styles.featuredCard}>
        <View style={[styles.featuredAccent, { backgroundColor: selectedRestaurant.accent }]} />
        <View style={styles.featuredTopRow}>
          <View>
            <Text style={styles.sectionLabel}>Featured spot</Text>
            <Text style={styles.featuredTitle}>{selectedRestaurant.name}</Text>
            <Text style={styles.featuredSub}>{selectedRestaurant.cuisine}</Text>
          </View>
          <View style={[styles.featuredBadge, { borderColor: selectedRestaurant.accent }]}>
            <Text style={styles.featuredBadgeText}>{selectedRestaurant.badge}</Text>
          </View>
        </View>

        <Text style={styles.featuredDesc}>{selectedRestaurant.description}</Text>

        <View style={styles.menuRow}>
          {selectedRestaurant.menu.map((item) => (
            <View key={item} style={styles.menuPill}>
              <Text style={styles.menuPillText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{selectedRestaurant.distance}</Text>
          <Text style={styles.metaText}>{selectedRestaurant.fee}</Text>
          <Text style={styles.metaText}>{selectedRestaurant.etaMinutes} min</Text>
        </View>

        <Pressable
          onPress={() => startOrder(selectedRestaurant)}
          style={[styles.orderButton, { backgroundColor: selectedRestaurant.accent }]}
        >
          <Text style={styles.orderButtonText}>Order now</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Nearby restaurants</Text>
        <Text style={styles.sectionCaption}>{filteredRestaurants.length} places</Text>
      </View>

      {filteredRestaurants.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptyText}>Try a different search or category.</Text>
          <Pressable
            onPress={() => {
              setSearch('');
              setSelectedCategory('All');
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Reset filters</Text>
          </Pressable>
        </View>
      ) : (
        filteredRestaurants.map((restaurant) => (
          <RestaurantCard
            key={restaurant.id}
            restaurant={restaurant}
            selected={selectedRestaurantId === restaurant.id}
            onSelect={() => setSelectedRestaurantId(restaurant.id)}
            onOrder={() => startOrder(restaurant)}
          />
        ))
      )}

      {activeRestaurant && (
        <Pressable style={styles.activeBanner} onPress={() => setActiveTab('track')}>
          <Text style={styles.activeBannerTitle}>Live order from {activeRestaurant.name}</Text>
          <Text style={styles.activeBannerSub}>
            {TRACKING_STEPS[orderStage].title} · ETA {liveEta} min
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );

  const renderTrack = () => {
    if (!activeRestaurant) {
      return (
        <View style={styles.emptyTrackCard}>
          <Text style={styles.emptyTitle}>No active order</Text>
          <Text style={styles.emptyText}>Place an order to start live tracking.</Text>
          <Pressable onPress={() => setActiveTab('home')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Browse restaurants</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.trackHeroCard}>
          <Text style={styles.sectionLabel}>Live tracking</Text>
          <Text style={styles.trackTitle}>{activeRestaurant.name}</Text>
          <Text style={styles.trackSub}>
            {activeRestaurant.cuisine} · Live location shared with customer
          </Text>

          <View style={styles.liveStatsRow}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveDot}>●</Text>
              <Text style={styles.liveBadgeText}>GPS ON</Text>
            </View>
            <Text style={styles.liveStatText}>Speed {liveSpeed} km/h</Text>
            <Text style={styles.liveStatText}>ETA {liveEta} min</Text>
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressTopRow}>
            <Text style={styles.sectionLabel}>Delivery route</Text>
            <Text style={styles.progressText}>{progress}% complete</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <RouteVisualizer stage={orderStage} />
        </View>

        <View style={styles.timelineCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Status timeline</Text>
            <Text style={styles.sectionCaption}>Auto-updating</Text>
          </View>

          {TRACKING_STEPS.map((step, index) => {
            const done = index < orderStage;
            const active = index === orderStage;
            return (
              <View key={step.title} style={styles.timelineRow}>
                <View style={[styles.timelineIcon, done && styles.timelineIconDone, active && styles.timelineIconActive]}>
                  <Text style={styles.timelineIconText}>{step.emoji}</Text>
                </View>
                <View style={styles.timelineTextBlock}>
                  <Text style={[styles.timelineTitle, active && styles.timelineTitleActive]}>{step.title}</Text>
                  <Text style={styles.timelineDetail}>{step.detail}</Text>
                </View>
                <Text style={[styles.timelineStatus, done && styles.timelineStatusDone, active && styles.timelineStatusActive]}>
                  {done ? 'Done' : active ? 'Now' : 'Next'}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={callRider} style={styles.secondaryButtonWide}>
            <Text style={styles.secondaryButtonText}>Call rider</Text>
          </Pressable>
          {orderStage < TRACKING_STEPS.length - 1 ? (
            <Pressable onPress={advanceTracking} style={styles.primaryButtonWide}>
              <Text style={styles.primaryButtonText}>Advance update</Text>
            </Pressable>
          ) : (
            <Pressable onPress={reorder} style={styles.primaryButtonWide}>
              <Text style={styles.primaryButtonText}>Order again</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    );
  };

  const renderProfile = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.profileCard}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>R</Text>
        </View>
        <View style={styles.profileHeaderText}>
          <Text style={styles.profileName}>Ricky</Text>
          <Text style={styles.profileSub}>oye member since 2024</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {PROFILE_STATS.map((item) => (
          <StatCard key={item.label} value={item.value} label={item.label} tone={item.tone} />
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <Text style={styles.sectionCaption}>Account and support</Text>
      </View>

      <View style={styles.quickActionCard}>
        <Text style={styles.quickActionTitle}>Saved address</Text>
        <Text style={styles.quickActionText}>Flat 402, Jubilee Hills, Hyderabad</Text>
      </View>

      <View style={styles.quickActionCard}>
        <Text style={styles.quickActionTitle}>Payment method</Text>
        <Text style={styles.quickActionText}>UPI ending in 2211</Text>
      </View>

      <View style={styles.quickActionCard}>
        <Text style={styles.quickActionTitle}>Support</Text>
        <Text style={styles.quickActionText}>24/7 chat, refund help, and live order updates</Text>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <View style={styles.container}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topBarTitle}>oye Delivery</Text>
            <Text style={styles.topBarSubtitle}>Food delivery app for Android</Text>
          </View>
          <View style={styles.topBarPill}>
            <Text style={styles.topBarPillText}>Live</Text>
          </View>
        </View>

        <View style={styles.screenArea}>
          {activeTab === 'home' && renderHome()}
          {activeTab === 'track' && renderTrack()}
          {activeTab === 'profile' && renderProfile()}
        </View>

        <View style={styles.bottomNav}>
          <TabButton icon="🏠" label="Home" active={activeTab === 'home'} onPress={() => setActiveTab('home')} />
          <TabButton icon="🧭" label="Track" active={activeTab === 'track'} onPress={() => setActiveTab('track')} />
          <TabButton icon="👤" label="Profile" active={activeTab === 'profile'} onPress={() => setActiveTab('profile')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -90,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(249, 115, 22, 0.18)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: 40,
    left: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  topBarSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 3,
  },
  topBarPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
  },
  topBarPillText: {
    color: '#bbf7d0',
    fontSize: 12,
    fontWeight: '700',
  },
  screenArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 120,
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
    marginBottom: 14,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  brand: {
    color: '#fff7ed',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroTitle: {
    color: '#f8fafc',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    maxWidth: 230,
  },
  heroSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    marginTop: 14,
    lineHeight: 20,
  },
  locationPill: {
    backgroundColor: 'rgba(249, 115, 22, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.28)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  locationPillText: {
    color: '#fed7aa',
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#111827',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  statLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 14,
  },
  searchCard: {
    borderRadius: 22,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    color: '#f59e0b',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#0b1220',
    borderColor: 'rgba(148,163,184,0.22)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#f8fafc',
    fontSize: 15,
  },
  categoryRow: {
    gap: 10,
    paddingBottom: 12,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  categoryChipActive: {
    backgroundColor: '#f97316',
    borderColor: '#fb923c',
  },
  categoryChipText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: '#fff7ed',
  },
  featuredCard: {
    borderRadius: 24,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  featuredAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 110,
    height: 110,
    borderBottomLeftRadius: 110,
    opacity: 0.16,
  },
  featuredTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  featuredTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '900',
  },
  featuredSub: {
    color: '#cbd5e1',
    marginTop: 4,
    fontSize: 13,
  },
  featuredBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  featuredBadgeText: {
    color: '#fff7ed',
    fontSize: 11,
    fontWeight: '800',
  },
  featuredDesc: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
  },
  menuRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  menuPill: {
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderColor: 'rgba(249,115,22,0.24)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  menuPillText: {
    color: '#fed7aa',
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  metaText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  orderButton: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  orderButtonText: {
    color: '#fff7ed',
    fontSize: 14,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionCaption: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  restaurantCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  restaurantAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    opacity: 0.95,
  },
  restaurantTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  restaurantTitleWrap: {
    flex: 1,
  },
  restaurantName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
  },
  restaurantCuisine: {
    color: '#cbd5e1',
    marginTop: 4,
    fontSize: 13,
  },
  ratingBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ratingText: {
    color: '#fff7ed',
    fontSize: 12,
    fontWeight: '800',
  },
  restaurantDesc: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
  },
  activeBanner: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#f97316',
    marginTop: 4,
  },
  activeBannerTitle: {
    color: '#fff7ed',
    fontSize: 16,
    fontWeight: '900',
  },
  activeBannerSub: {
    color: '#ffedd5',
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'flex-start',
  },
  emptyTrackCard: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
  },
  emptyText: {
    color: '#cbd5e1',
    marginTop: 8,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#f97316',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff7ed',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
  },
  trackHeroCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  trackTitle: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '900',
  },
  trackSub: {
    color: '#cbd5e1',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },
  liveStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.28)',
  },
  liveDot: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '900',
  },
  liveBadgeText: {
    color: '#bbf7d0',
    fontSize: 11,
    fontWeight: '900',
  },
  liveStatText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  progressCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  progressTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#0b1220',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#f97316',
  },
  routeCard: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
  },
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveTag: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  routeTrack: {
    height: 92,
    position: 'relative',
    marginBottom: 8,
  },
  routeRail: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.22)',
  },
  routeFill: {
    position: 'absolute',
    left: 24,
    top: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#f97316',
  },
  routeScooter: {
    position: 'absolute',
    top: 4,
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeScooterText: {
    fontSize: 14,
  },
  routeNode: {
    position: 'absolute',
    top: 29,
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeNodeActive: {
    borderColor: '#f97316',
    backgroundColor: 'rgba(249,115,22,0.18)',
  },
  routeNodeText: {
    fontSize: 14,
  },
  routeLegend: {
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#334155',
    marginTop: 5,
  },
  legendDotDone: {
    backgroundColor: '#22c55e',
  },
  legendDotActive: {
    backgroundColor: '#f97316',
  },
  legendTextBlock: {
    flex: 1,
  },
  legendTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
  },
  legendTitleActive: {
    color: '#fff7ed',
  },
  legendDetail: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  timelineCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  timelineIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  timelineIconDone: {
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  timelineIconActive: {
    borderColor: 'rgba(249,115,22,0.42)',
    backgroundColor: 'rgba(249,115,22,0.14)',
  },
  timelineIconText: {
    fontSize: 14,
  },
  timelineTextBlock: {
    flex: 1,
  },
  timelineTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '800',
  },
  timelineTitleActive: {
    color: '#fff7ed',
  },
  timelineDetail: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 3,
  },
  timelineStatus: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '900',
  },
  timelineStatusDone: {
    color: '#22c55e',
  },
  timelineStatusActive: {
    color: '#f97316',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  secondaryButtonWide: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 13,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  primaryButtonWide: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 13,
    backgroundColor: '#f97316',
    alignItems: 'center',
  },
  profileCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff7ed',
    fontSize: 24,
    fontWeight: '900',
  },
  profileHeaderText: {
    flex: 1,
  },
  profileName: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '900',
  },
  profileSub: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 4,
  },
  quickActionCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  quickActionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  quickActionText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
  },
  bottomNav: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    gap: 10,
    borderRadius: 24,
    padding: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(249,115,22,0.16)',
  },
  tabIcon: {
    fontSize: 18,
    opacity: 0.62,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
  },
  tabLabelActive: {
    color: '#fff7ed',
  },
});
