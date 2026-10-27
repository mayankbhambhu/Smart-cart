import { formatMoney, shortLocation, type CatalogProduct, type ItemLocation } from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCart, useShop } from '@/lib/stores';
import { colors, radius, shadow } from './theme';
import { ProductArt, Stepper } from './ui';

export function LocationTag({ location }: { location: ItemLocation | null | undefined }) {
  if (!location) return null;
  return (
    <View style={styles.location}>
      <Ionicons name="location" size={11} color={colors.info} />
      <Text style={styles.locationText}>{shortLocation(location)}</Text>
    </View>
  );
}

export function AddToCart({ product }: { product: CatalogProduct }) {
  const storeId = useShop((s) => s.storeId);
  const line = useCart((s) => (s.storeId === storeId ? s.lines.find((l) => l.productId === product.id) : undefined));
  const add = useCart((s) => s.add);
  const setQuantity = useCart((s) => s.setQuantity);
  if (product.stockStatus === 'OUT_OF_STOCK' || product.maxOrderQty === 0) return <Text style={styles.out}>Out of stock</Text>;
  if (line) return <Stepper value={line.quantity} max={product.maxOrderQty} onChange={(q) => setQuantity(product.id, q)} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${product.name}`}
      onPress={() => storeId && add(product, storeId)}
      style={styles.add}
    >
      <Text style={styles.addText}>ADD</Text>
    </Pressable>
  );
}

export function ProductCard({ product, width }: { product: CatalogProduct; width: number }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/product/${product.id}`)} style={[styles.card, { width }]}>
      {product.discountPercent > 0 && (
        <View style={styles.discount}>
          <Text style={styles.discountText}>{product.discountPercent}% OFF</Text>
        </View>
      )}
      <ProductArt emoji={product.emoji} color={product.color} size={width - 20} />
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      <Text style={styles.unit}>{product.unit}</Text>
      <LocationTag location={product.location} />
      <View style={styles.bottom}>
        <View>
          <Text style={styles.price}>{formatMoney(product.price)}</Text>
          {product.mrp > product.price && <Text style={styles.mrp}>{formatMoney(product.mrp)}</Text>}
        </View>
        <AddToCart product={product} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 10, gap: 4, ...shadow },
  discount: {
    position: 'absolute',
    zIndex: 1,
    top: 0,
    left: 10,
    backgroundColor: '#4f46e5',
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  discountText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  name: { fontSize: 13, fontWeight: '600', color: colors.ink, marginTop: 6, minHeight: 34 },
  unit: { fontSize: 12, color: colors.muted },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: 6 },
  price: { fontSize: 14, fontWeight: '800', color: colors.ink },
  mrp: { fontSize: 11, color: colors.faint, textDecorationLine: 'line-through' },
  add: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 32,
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  addText: { color: colors.brandDark, fontWeight: '800', fontSize: 13 },
  out: { fontSize: 11, color: colors.faint, fontWeight: '700' },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.infoSoft,
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  locationText: { fontSize: 10, fontWeight: '800', color: colors.info },
});
