import { cleanSpokenQuery, formatMoney, type CatalogProduct, type Paginated } from '@smartcart/shared';
import { useQuery } from '@tanstack/react-query';
import { Mic, MicOff, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { LocationTag, ProductArt } from '@/components/product';
import { Input } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn, useDebounced } from '@/lib/utils';
import { useVoiceInput } from '@/lib/voice';

export function useProductSearch(storeId: string | null | undefined, q: string, limit = 6) {
  const query = useDebounced(cleanSpokenQuery(q), 200);
  return useQuery({
    queryKey: ['product-search', storeId, query, limit],
    queryFn: () => publicApi.get<Paginated<CatalogProduct>>('/catalog/products', { query: { storeId, q: query, limit } }),
    enabled: Boolean(storeId) && query.length >= 2,
    placeholderData: (previous) => previous,
  });
}

/**
 * Type-ahead over the store's catalogue with optional voice input. Picking a
 * suggestion returns the product (with its price and aisle location); pressing
 * enter without a pick can add a free-text item instead.
 */
export function ProductSearchBox({
  storeId,
  onPick,
  onFreeText,
  placeholder = 'Search products',
  autoFocus,
  showLocation = true,
  className,
}: {
  storeId: string | null | undefined;
  onPick: (product: CatalogProduct) => void;
  onFreeText?: (name: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showLocation?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useProductSearch(storeId, q);
  const results = q.trim().length >= 2 ? (data?.items ?? []) : [];
  const voice = useVoiceInput((text) => {
    setQ(text);
    setOpen(true);
  });

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => setHighlight(0), [data]);

  const pick = (product: CatalogProduct) => {
    onPick(product);
    setQ('');
    setOpen(false);
  };
  const submitFreeText = () => {
    if (!onFreeText || !q.trim()) return;
    onFreeText(q.trim());
    setQ('');
    setOpen(false);
  };

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const chosen = results[highlight];
          if (chosen && open) pick(chosen);
          else submitFreeText();
        }}
      >
        <Search className="pointer-events-none absolute top-3 left-3 size-5 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={voice.listening ? 'Listening… say the item name' : placeholder}
          className="h-11 pr-12 pl-10"
          autoFocus={autoFocus}
          aria-label={placeholder}
        />
        {voice.supported && (
          <button
            type="button"
            onClick={voice.listening ? voice.stop : voice.start}
            aria-label={voice.listening ? 'Stop listening' : 'Search by voice'}
            className={cn(
              'absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-lg',
              voice.listening ? 'animate-pulse bg-rose-500 text-white' : 'text-slate-500 hover:bg-slate-100',
            )}
          >
            {voice.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
        )}
      </form>
      {open && q.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop">
          {results.length === 0 && !isFetching && <p className="px-4 py-3 text-sm text-slate-500">No products match "{q}".</p>}
          <ul className="max-h-80 overflow-y-auto">
            {results.map((product, i) => (
              <li key={product.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(product)}
                  className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === highlight ? 'bg-slate-50' : 'bg-white')}
                >
                  <ProductArt emoji={product.emoji} color={product.color} imageUrl={product.imageUrl} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{product.name}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {product.unit} · {formatMoney(product.price)}
                      {product.stockStatus === 'OUT_OF_STOCK' && <span className="font-semibold text-rose-600">Out of stock</span>}
                    </span>
                  </span>
                  {showLocation && <LocationTag location={product.location} />}
                </button>
              </li>
            ))}
          </ul>
          {onFreeText && (
            <button
              type="button"
              onClick={submitFreeText}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              <Plus className="size-4" /> Add "{q.trim()}" as a note item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
