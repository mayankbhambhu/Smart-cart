import { formatMoney, type CatalogProduct } from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProductCard } from '@/components/product';
import { colors, radius, shadow, space } from '@/components/theme';
import { EmptyState, H2, Loader, Muted, Segmented } from '@/components/ui';
import { useCurrentStore, useHomeFeed } from '@/lib/hooks';
import { cartTotals, useCartLines, useShop } from '@/lib/stores';

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { store, isLoading: storesLoading } = useCurrentStore();
  const { data: feed, isLoading, refetch, isRefetching } = useHomeFeed(store?.id);
  const mode = useShop((s) => s.mode);
  const setMode = useShop((s) => s.setMode);
  const lines = useCartLines(store?.id);
  const totals = cartTotals(lines);
  const cardWidth = (width - space.lg * 2 - space.md) / 2.3;
  const tile = (width - space.lg * 2 - space.sm * 3) / 4;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/stores')} style={{ flex: 1 }}>
          <Text style={styles.eta}>
            {mode === 'DELIVERY' ? `Delivery in ${store?.deliveryEtaMinutes ?? 10} minutes` : 'Scheduled pickup'}
          </Text>
          <Text style={styles.store} numberOfLines={1}>
            {store ? `${store.name}, ${store.city}` : 'Choose a store'} <Ionicons name="chevron-down" size={12} />
          </Text>
        </Pressable>
        <Pressable accessibilityLabel="Open cart" onPress={() => router.push('/cart')} style={styles.cartButton}>
          <Ionicons name="cart" size={20} color="#fff" />
          {totals.count > 0 && <Text style={styles.cartCount}>{totals.count}</Text>}
        </Pressable>
      </View>
      <Pressable onPress={() => router.push('/search')} style={styles.search}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <Text style={{ color: colors.faint }}>Search “milk”, “atta”, “chips”…</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={{ paddingBottom: totals.count > 0 ? 110 : 30 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.brand} />}
      >
        <View style={{ paddingHorizontal: space.lg, marginTop: space.sm }}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'DELIVERY', label: `⚡ Delivery · ${store?.deliveryEtaMinutes ?? 10} min` },
              { value: 'PICKUP', label: '🛍️ Pickup' },
            ]}
          />
        </View>

        <Pressable onPress={() => router.push('/(tabs)/instore')} style={styles.scango}>
          <View style={{ flex: 1 }}>
            <Text style={styles.scangoTitle}>Scan & Go in store</Text>
            <Text style={styles.scangoBody}>Find items by aisle, pay on your phone, skip the queue.</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color={colors.accent} />
        </Pressable>

        {storesLoading || isLoading ? (
          <Loader />
        ) : !feed ? (
          <EmptyState emoji="🏪" title="No store selected" body="Pick a store to start shopping." />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
            >
              {feed.banners.map((b) => (
                <View key={b.id} style={[styles.banner, { backgroundColor: b.bannerColor }]}>
                  <Text style={styles.bannerTitle} numberOfLines={2}>
                    {b.title}
                  </Text>
                  {b.description && (
                    <Text style={styles.bannerBody} numberOfLines={2}>
                      {b.description}
                    </Text>
                  )}
                  {b.code && <Text style={styles.bannerCode}>{b.code}</Text>}
                </View>
              ))}
            </ScrollView>

            <View style={{ paddingHorizontal: space.lg }}>
              <H2 style={{ marginTop: space.xl, marginBottom: space.sm }}>Shop by category</H2>
              <View style={styles.grid}>
                {feed.categories.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push({ pathname: '/category/[id]', params: { id: c.id, name: c.name } })}
                    style={{ width: tile }}
                  >
                    <View style={[styles.categoryArt, { backgroundColor: c.color, height: tile }]}>
                      <Text style={{ fontSize: tile * 0.45 }}>{c.emoji}</Text>
                    </View>
                    <Text style={styles.categoryName} numberOfLines={2}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {feed.sections.map((section) => (
              <View key={section.title}>
                <H2 style={{ marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.lg }}>{section.title}</H2>
                <FlatList<CatalogProduct>
                  horizontal
                  data={section.products}
                  keyExtractor={(p) => p.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}
                  renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
                />
              </View>
            ))}
            <Muted style={{ textAlign: 'center', padding: 20 }}>Prices include GST · pull down to refresh</Muted>
          </>
        )}
      </ScrollView>

      {totals.count > 0 && (
        <Pressable onPress={() => router.push('/cart')} style={styles.cartBar}>
          <View>
            <Text style={styles.cartBarCount}>{totals.count} items</Text>
            <Text style={styles.cartBarTotal}>{formatMoney(totals.total)}</Text>
          </View>
          <Text style={styles.cartBarCta}>View cart ›</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm },
  eta: { fontSize: 18, fontWeight: '800', color: colors.ink },
  store: { fontSize: 13, color: colors.muted, marginTop: 2 },
  cartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  cartCount: { color: '#fff', fontWeight: '800' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: space.lg,
    marginTop: space.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: '#eef2f6',
    paddingHorizontal: space.md,
  },
  scango: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    gap: space.md,
  },
  scangoTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  scangoBody: { color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  banner: { width: 250, borderRadius: radius.lg, padding: space.lg, minHeight: 120 },
  bannerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  bannerBody: { color: 'rgba(255,255,255,0.9)', marginTop: 4, fontSize: 13 },
  bannerCode: {
    marginTop: 'auto',
    alignSelf: 'flex-start',
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, rowGap: space.md },
  categoryArt: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  categoryName: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 4, color: colors.text },
  cartBar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: space.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadow,
  },
  cartBarCount: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  cartBarTotal: { color: '#fff', fontSize: 17, fontWeight: '800' },
  cartBarCta: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
