'use client';

import { useCart } from './CartProvider';

type CatProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  displayPrice: string;
  basePrice: number;
  partNumber?: string;
  imageUrl?: string;
};

const CATEGORIES = [
  {
    name: 'Filters & Fluids',
    image: '/cat/filters.png',
  },
  {
    name: 'Ground Engaging Tools',
    image: '/cat/ground-tools.png',
  },
  {
    name: 'Hydraulics',
    image: '/cat/hydraulics.png',
  },
  {
    name: 'Undercarriage',
    image: '/cat/undercarriage.png',
  },
];

function CatProductCard({ product }: { product: CatProduct }) {
  const { add } = useCart();
  return (
    <article className="border border-[#d5d5d5] bg-white flex flex-col min-w-0">
      <div className="h-44 bg-white flex items-center justify-center p-4 border-b border-[#e5e5e5]">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className="h-full w-full object-contain"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="text-5xl">{product.emoji}</span>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <p className="text-[12px] font-bold text-[#555]">{product.partNumber}</p>
        <h3 className="mt-1 text-[16px] font-bold leading-tight text-black">{product.name}</h3>
        <p className="mt-2 text-[13px] leading-snug text-[#555] flex-1">{product.description}</p>
        <p className="mt-4 text-[18px] font-bold text-black">{product.displayPrice}</p>
        <p className="mt-1 text-[11px] text-[#4d4d4d]">Price shown before dealer selection</p>
        <button
          onClick={() =>
            add({
              productId: product.id,
              name: product.name,
              emoji: product.emoji,
              price: product.basePrice,
              displayPrice: product.displayPrice,
            })
          }
          className="mt-4 w-full bg-[#ffcd11] hover:bg-[#f2bd00] text-black text-[13px] font-bold py-3 transition-colors"
        >
          ADD TO CART
        </button>
      </div>
    </article>
  );
}

export function CatPartsHome({ products }: { products: CatProduct[] }) {
  return (
    <div className="cat-store -mx-6 -mt-14 pb-12 text-black">
      <section
        className="relative min-h-[296px] bg-cover bg-center flex items-center"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(0,0,0,.88) 0%, rgba(0,0,0,.58) 44%, rgba(0,0,0,.08) 72%), url('/cat/hero.webp')",
        }}
      >
        <div className="w-full max-w-6xl mx-auto px-6 py-12 text-white">
          <p className="text-[13px] font-bold uppercase tracking-[.12em] text-[#ffcd11]">
            Genuine Cat® parts
          </p>
          <h1 className="mt-3 max-w-xl text-[36px] md:text-[44px] leading-[1.05] font-bold">
            Find parts and resources to get the job done
          </h1>
          <div className="mt-7 max-w-2xl flex bg-white shadow-lg">
            <input
              aria-label="Search for part number or name"
              placeholder="Search for part number or name"
              className="min-w-0 flex-1 px-5 py-4 text-[14px] text-black outline-none"
            />
            <button className="bg-[#ffcd11] px-7 text-[13px] font-bold text-black hover:bg-[#f2bd00]">
              SEARCH
            </button>
          </div>
        </div>
      </section>

      <section className="bg-[#f4f4f4] border-y border-[#ddd]">
        <div className="max-w-6xl mx-auto px-6 py-6 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div className="flex gap-4 items-center">
            <div className="w-11 h-11 rounded-full bg-[#ffcd11] flex items-center justify-center text-xl">
              ◉
            </div>
            <div>
              <h2 className="text-[20px] font-bold">Shop Cat® parts that fit</h2>
              <p className="text-[13px] text-[#555]">
                Select or add equipment to see parts built for your machine.
              </p>
            </div>
          </div>
          <button className="bg-black text-white font-bold text-[13px] px-7 py-3.5 hover:bg-[#333]">
            ADD EQUIPMENT
          </button>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6">
        <section className="py-11">
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[.12em] text-[#666]">
                Shop Cat® parts
              </p>
              <h2 className="mt-1 text-[30px] font-bold">Featured parts</h2>
            </div>
            <button className="text-[13px] font-bold border-b-2 border-[#ffcd11] pb-1">
              VIEW ALL PARTS
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {products.map((product) => (
              <CatProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        <section className="py-11 border-t border-[#d5d5d5]">
          <h2 className="text-[30px] font-bold mb-7">Shop by category</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {CATEGORIES.map((category) => (
              <button
                key={category.name}
                className="bg-white border border-[#d5d5d5] text-left hover:shadow-md transition-shadow"
              >
                <div className="h-40 p-3 flex items-center justify-center">
                  <img
                    src={category.image}
                    alt=""
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="border-t border-[#e5e5e5] px-4 py-4 text-[14px] font-bold">
                  {category.name} <span className="float-right text-[#b78c00]">›</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="my-8 bg-black text-white grid md:grid-cols-3">
          {[
            ['Built to last', 'All genuine Cat parts are backed by a 12-month warranty.'],
            ['Quick delivery', 'Choose from dealer pickup and jobsite delivery options.'],
            ['Pay your way', 'Secure payment options for customers worldwide.'],
          ].map(([title, body], i) => (
            <div key={title} className={`p-7 ${i ? 'md:border-l border-[#444]' : ''}`}>
              <div className="w-8 h-1 bg-[#ffcd11] mb-5" />
              <h3 className="text-[18px] font-bold">{title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[#ccc]">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
