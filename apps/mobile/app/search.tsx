import { cleanSpokenQuery, type CatalogProduct, type Paginated } from '@smartcart/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { ProductCard } from '@/components/product';
import { colors, radius, space } from '@/components/theme';
import { EmptyState, Loader, Muted } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { useCurrentStore, useDebounced } from '@/lib/hooks';

/** Catalogue search; every result shows its aisle and row in the selected store. Keyboard dictation works for voice search. */
export default function SearchScreen() {
  const { store } = useCurrentStore();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const query = useDebounced(cleanSpokenQuery(q));
  const { data, isFetching } = useQuery({
    queryKey: ['search', store?.id, query],
    queryFn: () => publicApi.get<Paginated<CatalogProduct>>('/catalog/products', { storeId: store!.id, q: query, limit: 40 }),
    enabled: Boolean(store) && query.length >= 2,
  });
  const cardWidth = (width - space.lg * 2 - space.md) / 2;
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.bar}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          autoFocus
          placeholder="Search for products"
          placeholderTextColor={colors.faint}
          style={styles.input}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      {query.length < 2 ? (
        <EmptyState
          emoji="🔎"
          title="What are you looking for?"
          body="Try “paneer”, “basmati rice” or “dog food”. Tap the mic on your keyboard to search by voice."
        />
      ) : isFetching && !data ? (
        <Loader />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: space.md }}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          ListHeaderComponent={<Muted>{data ? `${data.total} results in ${store?.name}` : ''}</Muted>}
          ListEmptyComponent={<EmptyState emoji="🤷" title={`No products match “${query}”`} />}
          renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: space.lg,
    marginBottom: 0,
    paddingHorizontal: space.md,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: { flex: 1, fontSize: 16, color: colors.ink },
});
