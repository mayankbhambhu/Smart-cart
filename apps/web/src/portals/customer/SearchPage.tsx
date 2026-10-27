import { useSearchParams } from 'react-router';
import { ProductCard } from '@/components/product';
import { EmptyState, Skeleton } from '@/components/ui';
import { useCurrentStore, useProducts } from './hooks';
import { useCustomerUi } from './ui-state';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { store } = useCurrentStore();
  const { data, isLoading } = useProducts({ storeId: store?.id, q, limit: 60 }, q.length > 0);
  const openProduct = useCustomerUi((s) => s.openProduct);
  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <h1 className="text-xl font-extrabold text-slate-900">Results for “{q}”</h1>
      <p className="text-sm text-slate-500">
        {data ? `${data.total} products` : 'Searching…'} at {store?.name}. Typos are fine, we will find it.
      </p>
      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.items.map((product) => (
            <ProductCard key={product.id} product={product} onOpen={openProduct} showLocation />
          ))}
        </div>
      ) : (
        <EmptyState icon="🔍" title="No products found" body="Try a different word, like “dahi” instead of “curd”." />
      )}
    </div>
  );
}
