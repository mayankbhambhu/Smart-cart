import { DIETARY_TAG_META, formatMoney, shortLocation, type CatalogProduct, type DietaryTag, type ItemLocation } from '@smartcart/shared';
import { MapPin, Timer } from 'lucide-react';
import { Button, Stepper } from '@/components/ui';
import { useCart, useShop } from '@/lib/stores';
import { cn } from '@/lib/utils';

export function ProductArt({
  emoji,
  color,
  imageUrl,
  size = 'md',
  className,
}: {
  emoji: string;
  color: string;
  imageUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims = {
    xs: 'size-9 text-xl rounded-lg',
    sm: 'size-12 text-2xl rounded-xl',
    md: 'aspect-square w-full text-5xl rounded-xl',
    lg: 'aspect-square w-full text-8xl rounded-2xl',
  }[size];
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden', dims, className)} style={{ backgroundColor: color }}>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden="true" className="drop-shadow-sm">
          {emoji}
        </span>
      )}
    </div>
  );
}

export function DietaryIcons({ tags, max = 3 }: { tags: DietaryTag[]; max?: number }) {
  const shown = tags
    .filter((t) => t === 'VEGAN' || t === 'GLUTEN_FREE' || t === 'KETO' || t === 'HIGH_PROTEIN' || t === 'ORGANIC' || t === 'JAIN')
    .slice(0, max);
  if (shown.length === 0) return null;
  return (
    <span className="inline-flex gap-1">
      {shown.map((tag) => (
        <span key={tag} title={DIETARY_TAG_META[tag].label} className="text-xs">
          {DIETARY_TAG_META[tag].emoji}
        </span>
      ))}
    </span>
  );
}

export function VegMark({ tags }: { tags: DietaryTag[] }) {
  const veg = tags.includes('VEGETARIAN') || tags.includes('VEGAN');
  return (
    <span
      title={veg ? 'Vegetarian' : 'Non-vegetarian'}
      className={cn('inline-flex size-3.5 items-center justify-center rounded-[3px] border', veg ? 'border-brand-600' : 'border-rose-600')}
    >
      <span className={cn('size-1.5 rounded-full', veg ? 'bg-brand-600' : 'bg-rose-600')} />
    </span>
  );
}

export function LocationTag({ location, className }: { location: ItemLocation | null | undefined; className?: string }) {
  if (!location) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-bold text-sky-800', className)}>
      <MapPin className="size-3" />
      {shortLocation(location)}
    </span>
  );
}

export function AddToCart({ product, compact }: { product: CatalogProduct; compact?: boolean }) {
  const storeId = useShop((s) => s.storeId);
  const line = useCart((s) => (s.storeId === storeId ? s.lines.find((l) => l.productId === product.id) : undefined));
  const add = useCart((s) => s.add);
  const setQuantity = useCart((s) => s.setQuantity);
  if (product.stockStatus === 'OUT_OF_STOCK' || product.maxOrderQty === 0) {
    return <span className="text-xs font-semibold text-slate-400">Out of stock</span>;
  }
  if (line)
    return (
      <Stepper size={compact ? 'sm' : 'md'} value={line.quantity} max={product.maxOrderQty} onChange={(q) => setQuantity(product.id, q)} />
    );
  return (
    <Button
      variant="outline"
      size={compact ? 'xs' : 'sm'}
      className="border-brand-600 px-4 font-bold text-brand-700 hover:bg-brand-50"
      onClick={() => storeId && add(product, storeId)}
    >
      ADD
    </Button>
  );
}

export function ProductCard({
  product,
  onOpen,
  showLocation,
}: {
  product: CatalogProduct;
  onOpen?: (product: CatalogProduct) => void;
  showLocation?: boolean;
}) {
  return (
    <div className="group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-2.5 shadow-card transition-shadow hover:shadow-pop">
      {product.discountPercent > 0 && (
        <span className="absolute top-0 left-3 z-10 rounded-b-md bg-indigo-600 px-1.5 pt-0.5 pb-1 text-center text-[10px] leading-tight font-extrabold text-white">
          {product.discountPercent}%<br />
          OFF
        </span>
      )}
      <button type="button" className="text-left" onClick={() => onOpen?.(product)}>
        <ProductArt emoji={product.emoji} color={product.color} imageUrl={product.imageUrl} />
        <div className="mt-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold text-slate-700">
            <Timer className="size-3" /> 10 MINS
          </span>
          <VegMark tags={product.dietaryTags} />
          <DietaryIcons tags={product.dietaryTags} max={2} />
        </div>
        <p className="mt-1.5 line-clamp-2 min-h-10 text-[13px] leading-5 font-semibold text-slate-900">{product.name}</p>
        <p className="text-xs text-slate-500">{product.unit}</p>
        {showLocation && <LocationTag location={product.location} className="mt-1" />}
        {product.offerTag && <p className="mt-1 truncate text-[11px] font-bold text-violet-700">{product.offerTag}</p>}
        {product.stockStatus === 'LOW_STOCK' && (
          <p className="mt-1 text-[11px] font-bold text-orange-600">Only {product.availableQty} left</p>
        )}
      </button>
      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
        <div className="leading-tight">
          <p className="tabular text-sm font-bold text-slate-900">{formatMoney(product.price)}</p>
          {product.mrp > product.price && <p className="tabular text-xs text-slate-400 line-through">{formatMoney(product.mrp)}</p>}
        </div>
        <AddToCart product={product} compact />
      </div>
    </div>
  );
}
