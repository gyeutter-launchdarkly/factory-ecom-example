export interface Product {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  category: 'electronics' | 'clothing' | 'home';
  emoji: string;
  inventory: number;
  rating: number;       // average user rating out of 5
  reviewCount: number;  // total number of reviews
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
    rating: 4.7,
    reviewCount: 284,
  },
  {
    id: 'prod-002',
    name: 'Smart Watch',
    description: 'Fitness tracking, heart rate monitor, 7-day battery',
    basePrice: 199.99,
    category: 'electronics',
    emoji: '⌚',
    inventory: 28,
    rating: 4.5,
    reviewCount: 193,
  },
  {
    id: 'prod-003',
    name: 'Mechanical Keyboard',
    description: 'TKL layout, RGB backlight, tactile switches',
    basePrice: 89.99,
    category: 'electronics',
    emoji: '⌨️',
    inventory: 75,
    rating: 4.8,
    reviewCount: 421,
  },
  {
    id: 'prod-004',
    name: 'Merino Wool Sweater',
    description: 'Lightweight, breathable, ethically sourced wool',
    basePrice: 79.99,
    category: 'clothing',
    emoji: '🧥',
    inventory: 100,
    rating: 4.3,
    reviewCount: 97,
  },
  {
    id: 'prod-005',
    name: 'Adjustable Desk Lamp',
    description: 'Tunable color temperature, built-in USB-A charging port',
    basePrice: 49.99,
    category: 'home',
    emoji: '💡',
    inventory: 60,
    rating: 4.6,
    reviewCount: 152,
  },
  {
    id: 'prod-006',
    name: 'Pour-Over Coffee Set',
    description: 'Glass carafe, stainless filter, bamboo stand',
    basePrice: 59.99,
    category: 'home',
    emoji: '☕',
    inventory: 15,
    rating: 4.9,
    reviewCount: 68,
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
