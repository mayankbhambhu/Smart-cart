import { DIETARY_TAG_META, type CatalogProduct, type DietaryTag, type Paginated } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, useWindowDimensions } from 'react-native';
import { ProductCard } from '@/components/product';
import { space } from '@/components/theme';
import { Chip, EmptyState, Loader } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { useCurrentStore, useProfile } from '@/lib/hooks';

const FILTERS: DietaryTag[] = ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'HIGH_PROTEIN', 'ORGANIC', 'SUGAR_FREE', 'JAIN'];
type Sort = 'relevance' | 'price_asc' | 'price_desc' | 'discount';

export default function CategoryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { store } = useCurrentStore();
  const { data: profile } = useProfile();
  const { width } = useWindowDimensions();
  const [dietary, setDietary] = useState<DietaryTag[] | null>(null);
  const [sort, setSort] = useState<Sort>('relevance');
  const active = dietary ?? profile?.dietaryPreferences.filter((t) => FILTERS.includes(t)) ?? [];
  const { data, isLoading } = useQuery({
    queryKey: ['category', store?.id, id, active.join(','), sort],
    queryFn: () =>
      publicApi.get<Paginated<CatalogProduct>>('/catalog/products', {
        storeId: store!.id,
        categoryId: id,
        dietary: active.join(',') || undefined,
        sort,
        limit: 100,
      }),
    enabled: Boolean(store && id),
  });
  const cardWidth = (width - space.lg * 2 - space.md) / 2;
  const toggle = (tag: DietaryTag) => setDietary(active.includes(tag) ? active.filter((t) => t !== tag) : [...active, tag]);

  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Category' }} />
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        ListHeaderComponent={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.sm }}>
            <Chip
              label={
                sort === 'price_asc' ? 'Price ↑' : sort === 'price_desc' ? 'Price ↓' : sort === 'discount' ? 'Best offers' : 'Relevance'
              }
              active={sort !== 'relevance'}
              onPress={() =>
                setSort(
                  sort === 'relevance'
                    ? 'price_asc'
                    : sort === 'price_asc'
                      ? 'price_desc'
                      : sort === 'price_desc'
                        ? 'discount'
                        : 'relevance',
                )
              }
            />
            {FILTERS.map((tag) => (
              <Chip
                key={tag}
                label={`${DIETARY_TAG_META[tag].emoji} ${DIETARY_TAG_META[tag].label}`}
                active={active.includes(tag)}
                onPress={() => toggle(tag)}
              />
            ))}
          </ScrollView>
        }
        ListEmptyComponent={isLoading ? <Loader /> : <EmptyState emoji="🥲" title="Nothing matches these filters" />}
        renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
      />
    </>
  );
}
