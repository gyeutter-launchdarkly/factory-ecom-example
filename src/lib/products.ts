export interface Product {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  category: string;
  emoji: string;
  inventory: number;
  partNumber?: string;
  imageUrl?: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    name: 'Wireless Headphones',
    description: 'Premium noise-cancelling with 30hr battery life',
    basePrice: 149.99,
    category: 'electronics',
    emoji: '🎧',
    inventory: 50,
  },
  {
    id: 'prod-002',
    name: 'Smart Watch',
    description: 'Fitness tracking, heart rate monitor, 7-day battery',
    basePrice: 199.99,
    category: 'electronics',
    emoji: '⌚',
    inventory: 28,
  },
  {
    id: 'prod-003',
    name: 'Mechanical Keyboard',
    description: 'TKL layout, RGB backlight, tactile switches',
    basePrice: 89.99,
    category: 'electronics',
    emoji: '⌨️',
    inventory: 75,
  },
  {
    id: 'prod-004',
    name: 'Merino Wool Sweater',
    description: 'Lightweight, breathable, ethically sourced wool',
    basePrice: 79.99,
    category: 'clothing',
    emoji: '🧥',
    inventory: 100,
  },
  {
    id: 'prod-005',
    name: 'Adjustable Desk Lamp',
    description: 'Tunable color temperature, built-in USB-A charging port',
    basePrice: 49.99,
    category: 'home',
    emoji: '💡',
    inventory: 60,
  },
  {
    id: 'prod-006',
    name: 'Pour-Over Coffee Set',
    description: 'Glass carafe, stainless filter, bamboo stand',
    basePrice: 59.99,
    category: 'home',
    emoji: '☕',
    inventory: 15,
  },
];

/**
 * Representative parts for the CAT demo profile. Images are Caterpillar's
 * official public category assets from parts.cat.com; they keep this facsimile
 * recognizable without checking customer-owned artwork into the repository.
 */
export const CAT_PRODUCTS: Product[] = [
  {
    id: 'cat-1r-1808',
    partNumber: '1R-1808',
    name: 'Engine Oil Filter',
    description: 'Advanced-efficiency spin-on engine oil filter',
    basePrice: 41.86,
    category: 'Filters & Fluids',
    emoji: '⚙',
    inventory: 36,
    imageUrl: '/cat/filters.png',
  },
  {
    id: 'cat-9w-2932',
    partNumber: '9W-2932',
    name: 'Bucket Tip',
    description: 'General-duty ground engaging tool for excavator buckets',
    basePrice: 128.4,
    category: 'Ground Engaging Tools',
    emoji: '⛏',
    inventory: 14,
    imageUrl: '/cat/ground-tools.png',
  },
  {
    id: 'cat-247-5212',
    partNumber: '247-5212',
    name: 'Hydraulic Hose Assembly',
    description: 'High-pressure XT hose assembly with permanent couplings',
    basePrice: 186.72,
    category: 'Hoses & Tubes',
    emoji: '〰',
    inventory: 8,
    imageUrl: '/cat/hoses.png',
  },
  {
    id: 'cat-153-5515',
    partNumber: '153-5515',
    name: 'Seal Kit',
    description: 'Hydraulic cylinder seal kit for contamination protection',
    basePrice: 92.15,
    category: 'Hardware, Seals & Consumables',
    emoji: '◉',
    inventory: 22,
    imageUrl: '/cat/hardware.png',
  },
];

export function getProduct(id: string): Product | undefined {
  return [...PRODUCTS, ...CAT_PRODUCTS].find((p) => p.id === id);
}
