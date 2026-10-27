import { formatMoney, type CatalogProduct, type OfferBanner } from '@smartcart/shared';
import { ArrowRight, ScanLine, ShoppingBag, Zap } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { ProductCard } from '@/components/product';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { useShop } from '@/lib/stores';
import { toast } from '@/lib/toast';
import { useCurrentStore, useHomeFeed, useProfile } from './hooks';
import { useCustomerUi } from './ui-state';

export default function HomePage() {
  const { store } = useCurrentStore();
  const { data, isLoading, error, refetch } = useHomeFeed(store?.id);
  const openProduct = useCustomerUi((s) => s.openProduct);
  const { data: profile } = useProfile();
  const diet = profile?.dietaryPreferences ?? [];

  if (error) return <ErrorState error={error} retry={() => void refetch()} />;
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-5">
      <Hero />
      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-36" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-9">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5]" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <OfferRail banners={data.banners} />
          <section>
            <h2 className="text-lg font-extrabold text-slate-900">Shop by category</h2>
            <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-9">
              {data.categories.map((category) => (
                <Link key={category.id} to={`/c/${category.id}`} className="group text-center">
                  <div
                    className="flex aspect-square items-center justify-center rounded-2xl text-4xl transition-transform group-hover:scale-[1.03]"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.emoji}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-4 font-semibold text-slate-800">{category.name}</p>
                </Link>
              ))}
            </div>
          </section>
          {diet.length > 0 && (
            <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
              🌱 Showing your dietary preferences ({diet.map((d) => d.toLowerCase().replace('_', '-')).join(', ')}). Use the filters on any
              category to see only matching products.
            </p>
          )}
          {data.sections.map((section) => (
            <ProductRail
              key={section.title}
              title={section.title}
              href={section.categoryId ? `/c/${section.categoryId}` : undefined}
              products={section.products}
              onOpen={openProduct}
            />
          ))}
        </>
      )}
    </div>
  );
}

function Hero() {
  const setMode = useShop((s) => s.setMode);
  return (
    <section className="grid gap-3 md:grid-cols-3">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white md:col-span-2">
        <p className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">
          <Zap className="size-3.5" /> 10-minute delivery
        </p>
        <h1 className="mt-3 max-w-md text-3xl font-extrabold tracking-tight">Groceries at your door before the kettle boils.</h1>
        <p className="mt-2 max-w-md text-sm text-white/80">
          Fresh produce, dairy and daily essentials from your neighbourhood SmartCart store.
        </p>
        <span className="pointer-events-none absolute -right-6 -bottom-8 text-[140px] opacity-90">🛒</span>
      </div>
      <div className="grid gap-3">
        <Link to="/instore" className="group flex items-center gap-4 rounded-3xl bg-slate-900 p-5 text-white">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-400 text-slate-900">
            <ScanLine className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block font-bold">Scan &amp; Go in store</span>
            <span className="block text-sm text-white/70">Find items by aisle, pay on your phone, skip the queue.</span>
          </span>
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
        </Link>
        <button
          type="button"
          onClick={() => {
            setMode('PICKUP');
            toast.success('Pickup mode is on', 'Add items to your cart, then choose a pickup slot at checkout.');
          }}
          className="group flex items-center gap-4 rounded-3xl bg-accent-100 p-5 text-left"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-card">
            <ShoppingBag className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block font-bold text-slate-900">Schedule a pickup</span>
            <span className="block text-sm text-slate-600">We pack it, you collect it at your slot.</span>
          </span>
          <ArrowRight className="size-5 text-slate-700 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </section>
  );
}

function OfferRail({ banners }: { banners: OfferBanner[] }) {
  return (
    <div className="flex snap-x gap-3 overflow-x-auto pb-1 scrollbar-none">
      {banners.map((banner) => (
        <div
          key={banner.id}
          className="w-72 shrink-0 snap-start rounded-2xl p-4 text-white shadow-card"
          style={{ background: `linear-gradient(135deg, ${banner.bannerColor}, ${banner.bannerColor}cc)` }}
        >
          <p className="text-xs font-bold tracking-wide uppercase opacity-80">Offer</p>
          <p className="mt-1 text-lg leading-snug font-extrabold">{banner.title}</p>
          <p className="mt-1 line-clamp-2 text-sm opacity-90">{banner.description}</p>
          <div className="mt-3 flex items-center justify-between text-xs">
            {banner.code ? <span className="rounded-md bg-white/20 px-2 py-1 font-mono font-bold">{banner.code}</span> : <span />}
            {banner.minOrderValue > 0 && <span className="opacity-80">Min. order {formatMoney(banner.minOrderValue)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProductRail({
  title,
  href,
  products,
  onOpen,
}: {
  title: string;
  href?: string;
  products: CatalogProduct[];
  onOpen: (product: CatalogProduct) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  if (products.length === 0) return null;
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
        {href && (
          <Link to={href}>
            <Button variant="ghost" size="sm" className="text-brand-700">
              See all
            </Button>
          </Link>
        )}
      </div>
      <div ref={ref} className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2 scrollbar-none">
        {products.map((product) => (
          <div key={product.id} className="w-40 shrink-0 snap-start sm:w-44">
            <ProductCard product={product} onOpen={onOpen} />
          </div>
        ))}
      </div>
    </section>
  );
}
