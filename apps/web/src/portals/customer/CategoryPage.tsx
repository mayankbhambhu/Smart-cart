import { DIETARY_TAGS, DIETARY_TAG_META, type DietaryTag } from '@smartcart/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ProductCard } from '@/components/product';
import { Chip, EmptyState, Select, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useCategories, useCurrentStore, useProducts } from './hooks';
import { useCustomerUi } from './ui-state';

export default function CategoryPage() {
  const { categoryId } = useParams();
  const { store } = useCurrentStore();
  const { data: categories = [] } = useCategories(store?.id);
  const [sort, setSort] = useState('relevance');
  const [diet, setDiet] = useState<DietaryTag[]>([]);
  const [inStock, setInStock] = useState(false);
  const { data, isLoading } = useProducts({
    storeId: store?.id,
    categoryId,
    sort,
    dietary: diet.join(',') || undefined,
    inStockOnly: inStock || undefined,
    limit: 100,
  });
  const openProduct = useCustomerUi((s) => s.openProduct);
  const category = categories.find((c) => c.id === categoryId);

  return (
    <div className="mx-auto flex max-w-7xl gap-0 px-0 sm:px-4">
      <aside className="sticky top-[120px] hidden max-h-[calc(100vh-130px)] w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-2 md:block">
        {categories.map((c) => (
          <Link
            key={c.id}
            to={`/c/${c.id}`}
            className={cn(
              'flex items-center gap-3 border-l-4 px-3 py-2.5 text-sm font-medium',
              c.id === categoryId
                ? 'border-brand-600 bg-brand-50 font-bold text-brand-800'
                : 'border-transparent text-slate-700 hover:bg-slate-50',
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xl" style={{ backgroundColor: c.color }}>
              {c.emoji}
            </span>
            <span className="line-clamp-2">{c.name}</span>
          </Link>
        ))}
      </aside>
      <section className="min-w-0 flex-1 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{category?.name ?? 'Products'}</h1>
            <p className="text-sm text-slate-500">
              {data ? `${data.total} items` : '…'} at {store?.name}
            </p>
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-48">
            <option value="relevance">Popular</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="discount">Biggest discount</option>
            <option value="name">Name</option>
          </Select>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Chip active={inStock} onClick={() => setInStock(!inStock)}>
            In stock
          </Chip>
          {DIETARY_TAGS.map((tag) => (
            <Chip
              key={tag}
              active={diet.includes(tag)}
              onClick={() => setDiet(diet.includes(tag) ? diet.filter((d) => d !== tag) : [...diet, tag])}
            >
              {DIETARY_TAG_META[tag].emoji} {DIETARY_TAG_META[tag].label}
            </Chip>
          ))}
        </div>
        {isLoading ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.items.map((product) => (
              <ProductCard key={product.id} product={product} onOpen={openProduct} />
            ))}
          </div>
        ) : (
          <EmptyState icon="🥲" title="Nothing matches these filters" body="Try removing a dietary filter." />
        )}
      </section>
    </div>
  );
}
