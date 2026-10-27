import { cleanSpokenQuery, describeLocation, formatMoney, type CatalogProduct } from '@smartcart/shared';
import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useProductSearch } from '@/lib/hooks';
import { LocationTag } from './product';
import { colors, radius, shadow, space } from './theme';
import { Button, Muted, ProductArt } from './ui';

/**
 * Type-ahead over the store's catalogue. Questions work too ("where is the
 * peanut butter?"), so keyboard dictation doubles as voice search. Submitting
 * without a pick can add a free-text item instead.
 */
export function ProductFinder({
  storeId,
  onPick,
  onFreeText,
  placeholder = 'Search products',
  autoFocus,
}: {
  storeId: string | null | undefined;
  onPick: (product: CatalogProduct) => void;
  onFreeText?: (name: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const query = cleanSpokenQuery(q);
  const { data, isFetching } = useProductSearch(storeId, query);
  const results = query.length >= 2 ? (data?.items ?? []) : [];

  const pick = (product: CatalogProduct) => {
    onPick(product);
    setQ('');
    Keyboard.dismiss();
  };
  const submit = () => {
    if (onFreeText && query) {
      onFreeText(query);
      setQ('');
    } else if (results[0]) pick(results[0]);
  };

  return (
    <View>
      <View style={styles.bar}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          style={styles.input}
          returnKeyType={onFreeText ? 'done' : 'search'}
          onSubmitEditing={submit}
          autoFocus={autoFocus}
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel={placeholder}
        />
        {isFetching && <ActivityIndicator size="small" color={colors.faint} />}
      </View>
      {query.length >= 2 && (
        <View style={[styles.results, shadow]}>
          {results.length === 0 && !isFetching && (
            <View style={{ padding: space.md, gap: space.sm }}>
              <Muted>No products match “{query}”.</Muted>
              {onFreeText && <Button title={`Add “${query}” as a note`} variant="outline" size="sm" onPress={submit} />}
            </View>
          )}
          {results.map((product) => (
            <Pressable
              key={product.id}
              onPress={() => pick(product)}
              style={({ pressed }) => [styles.result, pressed && { backgroundColor: '#f1f5f9' }]}
            >
              <ProductArt emoji={product.emoji} color={product.color} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {product.name}
                </Text>
                <Muted style={{ fontSize: 12 }}>
                  {product.unit} · {formatMoney(product.price)}
                  {product.stockStatus === 'OUT_OF_STOCK' ? ' · Out of stock' : ''}
                </Muted>
              </View>
              <LocationTag location={product.location} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** "Aisle 4 · Row 2 · Shelf B": where the picked product is, with price and shelf stock. */
export function FoundCard({ product, onClose, action }: { product: CatalogProduct; onClose?: () => void; action?: ReactNode }) {
  return (
    <View style={styles.found}>
      <ProductArt emoji={product.emoji} color={product.color} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.where}>
          <Ionicons name="location" size={14} color={colors.info} /> {describeLocation(product.location, { withLabel: true })}
        </Text>
        <Muted style={{ fontSize: 12 }}>
          {formatMoney(product.price)} ·{' '}
          {product.stockStatus === 'OUT_OF_STOCK'
            ? 'Out of stock'
            : product.onShelf
              ? `${product.availableQty} on the shelf`
              : 'In the storeroom, ask a staff member'}
        </Muted>
        {action && <View style={{ marginTop: 6, flexDirection: 'row' }}>{action}</View>}
      </View>
      {onClose && (
        <Pressable accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
          <Ionicons name="close" size={20} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: { flex: 1, fontSize: 16, color: colors.ink },
  results: { marginTop: 6, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: 10 },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  found: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.infoSoft,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  where: { fontSize: 15, fontWeight: '800', color: colors.info },
});
