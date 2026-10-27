import { DIETARY_TAG_META, describeLocation, formatMoney, type CatalogProduct } from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AddToCart } from '@/components/product';
import { colors, radius, space } from '@/components/theme';
import { Badge, Body, Card, H1, Loader, Muted, ProductArt, Row, Screen } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { useCurrentStore } from '@/lib/hooks';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { store } = useCurrentStore();
  const { data: product } = useQuery({
    queryKey: ['product', store?.id, id],
    queryFn: () => publicApi.get<CatalogProduct>(`/catalog/products/${id}`, { storeId: store!.id }),
    enabled: Boolean(store && id),
  });
  if (!product) return <Loader />;
  return (
    <Screen>
      <View style={{ alignItems: 'center' }}>
        <ProductArt emoji={product.emoji} color={product.color} size={180} />
      </View>
      <Muted style={{ marginTop: space.lg, textTransform: 'uppercase', fontWeight: '700' }}>{product.brand}</Muted>
      <H1>{product.name}</H1>
      <Muted>{product.unit}</Muted>
      <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
        <Row>
          <Text style={styles.price}>{formatMoney(product.price)}</Text>
          {product.mrp > product.price && (
            <>
              <Text style={styles.mrp}>MRP {formatMoney(product.mrp)}</Text>
              <Badge label={`${product.discountPercent}% OFF`} tone="blue" />
            </>
          )}
        </Row>
        <AddToCart product={product} />
      </Row>
      <Card style={{ marginTop: space.lg, gap: 4 }}>
        <Row>
          <Ionicons name="location" size={18} color={colors.info} />
          <Text style={styles.location}>{describeLocation(product.location, { withLabel: true })}</Text>
        </Row>
        <Muted>
          {product.stockStatus === 'OUT_OF_STOCK'
            ? `Out of stock at ${store?.name}`
            : product.onShelf
              ? `${product.availableQty} available at ${store?.name}`
              : 'In the storeroom: ask a staff member'}
        </Muted>
      </Card>
      {product.dietaryTags.length > 0 && (
        <Row style={{ flexWrap: 'wrap', marginTop: space.lg }}>
          {product.dietaryTags.map((t) => (
            <Badge key={t} label={`${DIETARY_TAG_META[t].emoji} ${DIETARY_TAG_META[t].label}`} tone="green" />
          ))}
        </Row>
      )}
      {product.allergens.length > 0 && (
        <Text style={styles.allergens}>Contains: {product.allergens.map((a) => a.toLowerCase().replace('_', ' ')).join(', ')}</Text>
      )}
      {product.description && <Body style={{ marginTop: space.lg }}>{product.description}</Body>}
      <Muted style={{ marginTop: space.lg }}>
        GST {product.taxRate}% included · SKU {product.sku}
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  price: { fontSize: 24, fontWeight: '800', color: colors.ink },
  mrp: { fontSize: 13, color: colors.faint, textDecorationLine: 'line-through' },
  location: { fontSize: 15, fontWeight: '800', color: colors.info, flex: 1 },
  allergens: {
    marginTop: space.md,
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    padding: space.md,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
