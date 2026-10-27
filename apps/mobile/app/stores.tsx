import {
  STOCK_STATUS_LABELS,
  cleanSpokenQuery,
  formatMoney,
  shortLocation,
  type StockCheckResult,
  type StoreSummary,
} from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, space } from '@/components/theme';
import { Badge, Button, Card, EmptyState, Loader, Muted, ProductArt, Row, Screen, SectionTitle } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';

function directionsUrl(store: StoreSummary): string {
  return Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${store.lat},${store.lng}&q=${encodeURIComponent(store.name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
}

/** Store locator and "is it in stock?" across every store before leaving home. */
export default function StoresScreen() {
  const router = useRouter();
  const storeId = useShop((s) => s.storeId);
  const setStore = useShop((s) => s.setStore);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [area, setArea] = useState('');
  const [item, setItem] = useState('');
  const debouncedArea = useDebounced(area.trim(), 300);
  const debouncedItem = useDebounced(cleanSpokenQuery(item), 350);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['stores', origin, debouncedArea],
    queryFn: () => publicApi.get<StoreSummary[]>('/stores', { ...origin, q: debouncedArea || undefined }),
  });
  const { data: stock, isFetching: checking } = useQuery({
    queryKey: ['stock-check', debouncedItem, origin],
    queryFn: () => publicApi.get<StockCheckResult[]>('/stores/stock-check', { q: debouncedItem, ...origin }),
    enabled: debouncedItem.length >= 2,
  });

  const locate = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        toast.error('Location is off', 'Search by area or PIN code instead.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      toast.error('Location unavailable', 'Search by area or PIN code instead.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <Screen>
      <Card style={{ gap: space.sm }}>
        <Row>
          <Ionicons name="cube-outline" size={20} color={colors.brand} />
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }}>Inventory check</Text>
        </Row>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            value={item}
            onChangeText={setItem}
            placeholder="Is it in stock? e.g. almond milk"
            placeholderTextColor={colors.faint}
            style={styles.input}
            clearButtonMode="while-editing"
          />
        </View>
        {debouncedItem.length >= 2 && (
          <View style={{ gap: space.sm, opacity: checking ? 0.6 : 1 }}>
            {stock?.length === 0 && <Muted>No products match “{debouncedItem}”.</Muted>}
            {stock?.slice(0, 4).map((result) => (
              <View key={result.product.id} style={styles.stockCard}>
                <Row gap={space.md}>
                  <ProductArt emoji={result.product.emoji} color={result.product.color} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }} numberOfLines={1}>
                      {result.product.name}
                    </Text>
                    <Muted style={{ fontSize: 12 }}>{result.product.unit}</Muted>
                  </View>
                </Row>
                {result.stores.map((entry) => (
                  <Row key={entry.store.id} style={{ justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.text }} numberOfLines={1}>
                      {entry.store.name.replace('SmartCart ', '')}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700' }}>{formatMoney(entry.price)}</Text>
                    {entry.location && entry.stockStatus !== 'OUT_OF_STOCK' && (
                      <Muted style={{ fontSize: 12 }}>{shortLocation(entry.location)}</Muted>
                    )}
                    <Badge
                      label={entry.stockStatus === 'LOW_STOCK' ? `${entry.availableQty} left` : STOCK_STATUS_LABELS[entry.stockStatus]}
                      tone={entry.stockStatus === 'IN_STOCK' ? 'green' : entry.stockStatus === 'LOW_STOCK' ? 'yellow' : 'red'}
                    />
                  </Row>
                ))}
              </View>
            ))}
          </View>
        )}
      </Card>

      <SectionTitle
        title="Stores near you"
        action={
          <Button
            title={origin ? 'Located' : 'Use my location'}
            icon="locate"
            variant="outline"
            size="sm"
            loading={locating}
            onPress={() => void locate()}
          />
        }
      />
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput
          value={area}
          onChangeText={setArea}
          placeholder="Search by area, city or PIN code"
          placeholderTextColor={colors.faint}
          style={styles.input}
          clearButtonMode="while-editing"
        />
      </View>
      <View style={{ gap: space.md, marginTop: space.md }}>
        {isLoading ? (
          <Loader />
        ) : stores.length === 0 ? (
          <EmptyState emoji="🗺️" title="No stores found" body="Try another area or PIN code." />
        ) : (
          stores.map((store) => (
            <Card key={store.id} style={store.id === storeId ? { borderColor: colors.brand, borderWidth: 2 } : undefined}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }}>{store.name}</Text>
                  <Muted numberOfLines={2}>
                    {store.addressLine}, {store.city} {store.pincode}
                  </Muted>
                </View>
                <Badge label={store.isOpenNow ? 'Open now' : 'Closed'} tone={store.isOpenNow ? 'green' : 'gray'} />
              </Row>
              <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={space.md}>
                <Muted style={{ fontSize: 12 }}>
                  🕒 {store.openingTime === store.closingTime ? 'Open 24 hours' : `${store.openingTime}–${store.closingTime}`}
                </Muted>
                {store.distanceKm !== null && <Muted style={{ fontSize: 12 }}>📍 {store.distanceKm} km away</Muted>}
              </Row>
              <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
                {store.supportsDelivery && <Badge label={`⚡ ${store.deliveryEtaMinutes}-min delivery`} tone="green" />}
                {store.supportsPickup && <Badge label="🛍️ Pickup" tone="blue" />}
                {store.supportsInStore && <Badge label="📱 Scan & Go" tone="violet" />}
              </Row>
              <Row style={{ marginTop: space.md }}>
                <Button
                  title="Shop here"
                  size="sm"
                  onPress={() => {
                    setStore(store.id);
                    router.back();
                  }}
                />
                <Button
                  title="Directions"
                  icon="navigate"
                  size="sm"
                  variant="outline"
                  onPress={() => void Linking.openURL(directionsUrl(store))}
                />
                <Button title="Call" icon="call" size="sm" variant="ghost" onPress={() => void Linking.openURL(`tel:${store.phone}`)} />
              </Row>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: { flex: 1, fontSize: 15, color: colors.ink },
  stockCard: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md },
});
