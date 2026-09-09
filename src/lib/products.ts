export interface Product {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  /** Free-form: a demo pack supplies its own categories for its own catalog. */
  category: string;
  emoji: string;
  inventory: number;
  image?: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 'prod-001',
    image: '/products/headphones.jpg',
    name: 'Wireless Headphones',
    description: 'Premium noise-cancelling with 30hr battery life',
    basePrice: 149.99,
    category: 'electronics',
    emoji: '🎧',
    inventory: 50,
  },
  {
    id: 'prod-002',
    image: '/products/watch.jpg',
    name: 'Smart Watch',
    description: 'Fitness tracking, heart rate monitor, 7-day battery',
    basePrice: 199.99,
    category: 'electronics',
    emoji: '⌚',
    inventory: 28,
  },
  {
    id: 'prod-003',
    image: '/products/keyboard.jpg',
    name: 'Mechanical Keyboard',
    description: 'TKL layout, RGB backlight, tactile switches',
    basePrice: 89.99,
    category: 'electronics',
    emoji: '⌨️',
    inventory: 75,
  },
  {
    id: 'prod-004',
    image: '/products/sweater.jpg',
    name: 'Merino Wool Sweater',
    description: 'Lightweight, breathable, ethically sourced wool',
    basePrice: 79.99,
    category: 'clothing',
    emoji: '🧥',
    inventory: 100,
  },
  {
    id: 'prod-005',
    image: '/products/lamp.jpg',
    name: 'Adjustable Desk Lamp',
    description: 'Tunable color temperature, built-in USB-A charging port',
    basePrice: 49.99,
    category: 'home',
    emoji: '💡',
    inventory: 60,
  },
  {
    id: 'prod-006',
    image: '/products/coffee.jpg',
    name: 'Pour-Over Coffee Set',
    description: 'Glass carafe, stainless filter, bamboo stand',
    basePrice: 59.99,
    category: 'home',
    emoji: '☕',
    inventory: 15,
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
