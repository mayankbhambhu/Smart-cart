import type { Allergen, DietaryTag } from '@smartcart/shared';

/**
 * Demo catalogue. Prices are in rupees here and converted to paise by the
 * seeder. Each category maps to an aisle in the generated store layouts.
 */

export interface SeedCategory {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  /** aisle number in the standard store layout */
  aisle: number;
  taxRate: number;
  /** cost as a fraction of selling price */
  costRatio: number;
  /** relative popularity used when generating order history */
  popularity: number;
}

export type SeedProductRow = [
  name: string,
  brand: string,
  unit: string,
  mrp: number,
  price: number,
  emoji: string,
  tags: DietaryTag[],
  allergens?: Allergen[],
];

export const AISLE_LABELS = [
  'Fruits & Vegetables',
  'Dairy, Bread & Eggs',
  'Bakery & Breakfast',
  'Snacks & Sweets',
  'Beverages',
  'Staples & Masala',
  'Sauces & Organic',
  'Meat, Fish & Frozen',
  'Personal & Baby Care',
  'Home & Pet Care',
];

export const CATEGORIES: SeedCategory[] = [
  { slug: 'fruits-vegetables', name: 'Fruits & Vegetables', emoji: '🥦', color: '#E7F6EC', aisle: 1, taxRate: 0, costRatio: 0.68, popularity: 10 },
  { slug: 'dairy-bread-eggs', name: 'Dairy, Bread & Eggs', emoji: '🥛', color: '#E6F0FB', aisle: 2, taxRate: 0, costRatio: 0.84, popularity: 12 },
  { slug: 'bakery-biscuits', name: 'Bakery & Biscuits', emoji: '🍪', color: '#FDF1E3', aisle: 3, taxRate: 18, costRatio: 0.8, popularity: 6 },
  { slug: 'breakfast-instant', name: 'Breakfast & Instant Food', emoji: '🥣', color: '#FCE8EF', aisle: 3, taxRate: 12, costRatio: 0.79, popularity: 6 },
  { slug: 'snacks-munchies', name: 'Snacks & Munchies', emoji: '🍿', color: '#FFF6DB', aisle: 4, taxRate: 12, costRatio: 0.76, popularity: 8 },
  { slug: 'sweet-tooth', name: 'Sweet Tooth', emoji: '🍫', color: '#F4E9F7', aisle: 4, taxRate: 18, costRatio: 0.78, popularity: 5 },
  { slug: 'cold-drinks-juices', name: 'Cold Drinks & Juices', emoji: '🥤', color: '#E2F6F8', aisle: 5, taxRate: 18, costRatio: 0.77, popularity: 7 },
  { slug: 'tea-coffee', name: 'Tea, Coffee & Health Drinks', emoji: '☕', color: '#F1EBE7', aisle: 5, taxRate: 5, costRatio: 0.8, popularity: 4 },
  { slug: 'atta-rice-dal', name: 'Atta, Rice & Dal', emoji: '🌾', color: '#FBEDE6', aisle: 6, taxRate: 5, costRatio: 0.86, popularity: 6 },
  { slug: 'masala-oil', name: 'Masala, Oil & More', emoji: '🫙', color: '#FFF1E0', aisle: 6, taxRate: 5, costRatio: 0.82, popularity: 4 },
  { slug: 'sauces-spreads', name: 'Sauces & Spreads', emoji: '🍯', color: '#FFFBE3', aisle: 7, taxRate: 12, costRatio: 0.78, popularity: 3 },
  { slug: 'organic-healthy', name: 'Organic & Healthy Living', emoji: '🥗', color: '#EEF7E6', aisle: 7, taxRate: 5, costRatio: 0.72, popularity: 3 },
  { slug: 'meat-fish', name: 'Chicken, Meat & Fish', emoji: '🍗', color: '#FDE9EA', aisle: 8, taxRate: 0, costRatio: 0.74, popularity: 4 },
  { slug: 'frozen-food', name: 'Frozen Food', emoji: '🧊', color: '#E9ECF8', aisle: 8, taxRate: 12, costRatio: 0.75, popularity: 3 },
  { slug: 'personal-care', name: 'Personal Care', emoji: '🧴', color: '#E2F3F1', aisle: 9, taxRate: 18, costRatio: 0.7, popularity: 4 },
  { slug: 'baby-care', name: 'Baby Care', emoji: '🍼', color: '#FCEAF1', aisle: 9, taxRate: 12, costRatio: 0.78, popularity: 2 },
  { slug: 'cleaning-essentials', name: 'Cleaning Essentials', emoji: '🧽', color: '#E3F2FC', aisle: 10, taxRate: 18, costRatio: 0.72, popularity: 4 },
  { slug: 'pet-care', name: 'Pet Care', emoji: '🐾', color: '#F0F7E8', aisle: 10, taxRate: 18, costRatio: 0.75, popularity: 1 },
];

const VEG: DietaryTag[] = ['VEGETARIAN'];
const VEGAN: DietaryTag[] = ['VEGETARIAN', 'VEGAN', 'DAIRY_FREE', 'EGG_FREE'];
const VEGAN_GF: DietaryTag[] = [...VEGAN, 'GLUTEN_FREE'];
const PRODUCE: DietaryTag[] = [...VEGAN_GF, 'NUT_FREE', 'JAIN'];

export const PRODUCTS: Record<string, SeedProductRow[]> = {
  'fruits-vegetables': [
    ['Banana Robusta', 'Fresh', '6 pcs (approx. 1 kg)', 70, 52, '🍌', PRODUCE],
    ['Apple Shimla', 'Fresh', '4 pcs (approx. 600 g)', 180, 149, '🍎', PRODUCE],
    ['Onion', 'Fresh', '1 kg', 60, 42, '🧅', VEGAN_GF],
    ['Potato', 'Fresh', '1 kg', 50, 36, '🥔', VEGAN_GF],
    ['Tomato Hybrid', 'Fresh', '500 g', 40, 29, '🍅', PRODUCE],
    ['Coriander Leaves', 'Fresh', '100 g', 25, 15, '🌿', PRODUCE],
    ['Green Chilli', 'Fresh', '100 g', 20, 12, '🌶️', PRODUCE],
    ['Lemon', 'Fresh', '4 pcs', 30, 24, '🍋', PRODUCE],
    ['Carrot Orange', 'Fresh', '500 g', 45, 34, '🥕', VEGAN_GF],
    ['Cucumber', 'Fresh', '500 g', 40, 28, '🥒', PRODUCE],
    ['Avocado Imported', 'Fresh', '1 pc', 199, 159, '🥑', [...PRODUCE, 'KETO']],
    ['Grapes Green Seedless', 'Fresh', '500 g', 120, 89, '🍇', PRODUCE],
    ['Mango Alphonso', 'Fresh', '6 pcs', 899, 749, '🥭', PRODUCE],
    ['Broccoli', 'Fresh', '1 pc (approx. 300 g)', 90, 69, '🥦', [...PRODUCE, 'KETO']],
  ],
  'dairy-bread-eggs': [
    ['Taaza Toned Milk', 'Amul', '500 ml', 28, 28, '🥛', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Gold Full Cream Milk', 'Amul', '1 L', 70, 68, '🥛', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Salted Butter', 'Amul', '100 g', 62, 58, '🧈', [...VEG, 'GLUTEN_FREE', 'KETO'], ['MILK']],
    ['Fresh Paneer', 'Amul', '200 g', 95, 90, '🧀', [...VEG, 'GLUTEN_FREE', 'HIGH_PROTEIN', 'KETO'], ['MILK']],
    ['Masti Dahi', 'Amul', '400 g', 40, 38, '🥣', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Brown Bread', 'Britannia', '400 g', 55, 50, '🍞', VEG, ['WHEAT']],
    ['White Sandwich Bread', 'Modern', '400 g', 45, 42, '🍞', VEG, ['WHEAT']],
    ['Farm Fresh Eggs', 'Eggoz', '6 pcs', 72, 65, '🥚', ['GLUTEN_FREE', 'HIGH_PROTEIN', 'KETO'], ['EGGS']],
    ['Cheese Slices', 'Britannia', '200 g (10 slices)', 155, 139, '🧀', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Greek Yogurt Blueberry', 'Epigamia', '90 g', 60, 55, '🫐', [...VEG, 'HIGH_PROTEIN'], ['MILK']],
    ['Almond Milk Unsweetened', 'So Good', '1 L', 299, 249, '🥛', [...VEGAN_GF, 'SUGAR_FREE'], ['TREE_NUTS']],
    ['Lassi Rose', 'Amul', '200 ml', 25, 25, '🥤', VEG, ['MILK']],
  ],
  'bakery-biscuits': [
    ['Good Day Cashew Cookies', 'Britannia', '200 g', 40, 36, '🍪', VEG, ['WHEAT', 'TREE_NUTS', 'MILK']],
    ['Marie Gold', 'Britannia', '250 g', 40, 38, '🍪', VEG, ['WHEAT', 'MILK']],
    ['Dark Fantasy Choco Fills', 'Sunfeast', '75 g', 40, 38, '🍫', VEG, ['WHEAT', 'MILK', 'SOY']],
    ['Parle-G Original', 'Parle', '800 g', 90, 85, '🍪', VEG, ['WHEAT', 'MILK']],
    ['Oreo Vanilla Creme', 'Cadbury', '120 g', 40, 35, '🍪', VEG, ['WHEAT', 'SOY']],
    ['Multigrain Rusk', 'Britannia', '300 g', 75, 68, '🥖', VEG, ['WHEAT', 'MILK']],
    ['Chocolate Muffin', 'Britannia', '2 pcs', 50, 45, '🧁', VEG, ['WHEAT', 'EGGS', 'MILK']],
    ['Gluten-Free Digestive', 'Nutriwish', '150 g', 199, 169, '🍪', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Pav Buns', 'Harvest Gold', '6 pcs', 35, 32, '🍞', VEG, ['WHEAT']],
  ],
  'breakfast-instant': [
    ['Masala Noodles', 'Maggi', '4 x 70 g', 72, 68, '🍜', VEG, ['WHEAT']],
    ['Corn Flakes Original', "Kellogg's", '475 g', 210, 189, '🥣', VEG, ['MILK']],
    ['Rolled Oats', 'Quaker', '1 kg', 199, 175, '🥣', [...VEGAN, 'HIGH_PROTEIN']],
    ['Muesli Fruit & Nut', "Kellogg's", '500 g', 375, 329, '🥣', VEG, ['TREE_NUTS', 'WHEAT']],
    ['Poha Thick', 'Tata Sampann', '500 g', 65, 55, '🍚', VEGAN_GF],
    ['Instant Upma Mix', 'MTR', '180 g', 65, 60, '🍲', VEG],
    ['Peanut Butter Crunchy', 'Pintola', '350 g', 225, 189, '🥜', [...VEGAN_GF, 'HIGH_PROTEIN'], ['PEANUTS']],
    ['Cup Noodles Mazedaar Masala', 'Sunfeast YiPPee', '70 g', 50, 45, '🍜', VEG, ['WHEAT']],
    ['Ready to Eat Dal Makhani', 'MTR', '300 g', 140, 125, '🍛', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Instant Idli Mix', 'Gits', '500 g', 110, 99, '🍥', [...VEGAN_GF]],
  ],
  'snacks-munchies': [
    ["Classic Salted Chips", "Lay's", '52 g', 20, 20, '🥔', VEGAN_GF],
    ["Magic Masala Chips", "Lay's", '52 g', 20, 20, '🥔', [...VEG, 'GLUTEN_FREE']],
    ['Aloo Bhujia', "Haldiram's", '400 g', 110, 99, '🥨', VEGAN_GF],
    ['Kurkure Masala Munch', 'Kurkure', '90 g', 20, 20, '🌽', VEG],
    ['Nacho Chips Cheese', 'Doritos', '75 g', 50, 45, '🌮', VEG, ['MILK']],
    ['Roasted Makhana Peri Peri', 'Farmley', '60 g', 120, 99, '🍿', [...VEG, 'GLUTEN_FREE', 'HIGH_PROTEIN']],
    ['Salted Peanuts', "Haldiram's", '200 g', 60, 55, '🥜', VEGAN_GF, ['PEANUTS']],
    ['Popcorn Butter', 'Act II', '150 g', 65, 60, '🍿', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Moong Dal', "Haldiram's", '200 g', 60, 56, '🫘', VEGAN_GF],
    ['Protein Chips Cream & Onion', 'The Whole Truth', '40 g', 99, 89, '🥔', [...VEG, 'HIGH_PROTEIN'], ['MILK', 'SOY']],
  ],
  'sweet-tooth': [
    ['Dairy Milk Silk', 'Cadbury', '60 g', 90, 85, '🍫', VEG, ['MILK', 'SOY']],
    ['KitKat 4 Finger', 'Nestlé', '37.3 g', 30, 30, '🍫', VEG, ['MILK', 'WHEAT']],
    ['Dark Chocolate 70%', 'Amul', '125 g', 160, 150, '🍫', [...VEG, 'GLUTEN_FREE']],
    ['Rasgulla Tin', "Haldiram's", '1 kg', 250, 225, '🍮', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Kaju Katli', "Haldiram's", '250 g', 330, 299, '🍬', [...VEG, 'GLUTEN_FREE'], ['TREE_NUTS', 'MILK']],
    ['Vanilla Ice Cream Tub', 'Kwality Walls', '700 ml', 230, 199, '🍨', VEG, ['MILK']],
    ['Sugar-Free Dark Chocolate', 'Sugarfree', '40 g', 120, 110, '🍫', [...VEG, 'SUGAR_FREE'], ['MILK']],
    ['Jelly Gems', 'Cadbury', '30 g', 10, 10, '🍬', VEG],
  ],
  'cold-drinks-juices': [
    ['Coca-Cola', 'Coca-Cola', '750 ml', 45, 40, '🥤', VEGAN_GF],
    ['Sprite', 'Sprite', '750 ml', 45, 40, '🥤', VEGAN_GF],
    ['Thums Up', 'Thums Up', '1.25 L', 75, 70, '🥤', VEGAN_GF],
    ['Real Mixed Fruit Juice', 'Dabur', '1 L', 130, 115, '🧃', VEGAN_GF],
    ['Tender Coconut Water', 'Paper Boat', '200 ml', 50, 45, '🥥', [...PRODUCE]],
    ['Packaged Drinking Water', 'Bisleri', '1 L', 20, 20, '💧', PRODUCE],
    ['Red Bull Energy Drink', 'Red Bull', '250 ml', 125, 120, '⚡', VEGAN_GF],
    ['Cold Coffee', 'Starbucks', '180 ml', 99, 89, '🧋', [...VEG, 'GLUTEN_FREE'], ['MILK']],
    ['Kombucha Ginger Lemon', 'Bhu Kombucha', '330 ml', 160, 140, '🍹', [...VEGAN_GF, 'ORGANIC']],
    ['Diet Coke', 'Coca-Cola', '300 ml can', 40, 40, '🥤', [...VEGAN_GF, 'SUGAR_FREE']],
  ],
  'tea-coffee': [
    ['Tata Tea Gold', 'Tata Tea', '500 g', 330, 295, '🍵', VEGAN_GF],
    ['Red Label Natural Care', 'Brooke Bond', '500 g', 310, 285, '🍵', VEGAN_GF],
    ['Classic Instant Coffee', 'Nescafé', '100 g', 340, 310, '☕', VEGAN_GF],
    ['Filter Coffee Powder', 'Bru', '200 g', 199, 180, '☕', VEGAN_GF],
    ['Green Tea Classic', 'Lipton', '25 bags', 180, 155, '🍵', VEGAN_GF],
    ['Bournvita Health Drink', 'Cadbury', '500 g', 249, 230, '🥤', VEG, ['MILK', 'WHEAT']],
    ['Horlicks Classic Malt', 'Horlicks', '500 g', 285, 265, '🥤', VEG, ['MILK', 'WHEAT']],
  ],
  'atta-rice-dal': [
    ['Shudh Chakki Atta', 'Aashirvaad', '5 kg', 310, 275, '🌾', VEGAN, ['WHEAT']],
    ['Basmati Rice Classic', 'India Gate', '1 kg', 160, 139, '🍚', VEGAN_GF],
    ['Toor Dal', 'Tata Sampann', '1 kg', 199, 175, '🫘', [...VEGAN_GF, 'HIGH_PROTEIN']],
    ['Moong Dal Yellow', 'Tata Sampann', '500 g', 99, 89, '🫘', [...VEGAN_GF, 'HIGH_PROTEIN']],
    ['Chana Dal', 'Fortune', '1 kg', 110, 98, '🫘', [...VEGAN_GF, 'HIGH_PROTEIN']],
    ['Sona Masoori Rice', 'Daawat', '5 kg', 450, 399, '🍚', VEGAN_GF],
    ['Besan', 'Rajdhani', '500 g', 70, 62, '🌾', VEGAN_GF],
    ['Multigrain Atta', 'Aashirvaad', '1 kg', 90, 82, '🌾', VEGAN, ['WHEAT']],
    ['Quinoa White', 'True Elements', '500 g', 299, 245, '🌾', [...VEGAN_GF, 'HIGH_PROTEIN', 'ORGANIC']],
  ],
  'masala-oil': [
    ['Sunflower Oil', 'Fortune', '1 L', 175, 155, '🫗', VEGAN_GF],
    ['Kachi Ghani Mustard Oil', 'Fortune', '1 L', 195, 175, '🫗', VEGAN_GF],
    ['Pure Cow Ghee', 'Amul', '1 L', 650, 610, '🧈', [...VEG, 'GLUTEN_FREE', 'KETO'], ['MILK']],
    ['Iodised Salt', 'Tata Salt', '1 kg', 28, 27, '🧂', PRODUCE],
    ['Turmeric Powder', 'Everest', '200 g', 68, 62, '🫙', PRODUCE],
    ['Kitchen King Masala', 'MDH', '100 g', 85, 78, '🫙', VEGAN_GF],
    ['Red Chilli Powder', 'Everest', '200 g', 115, 105, '🌶️', VEGAN_GF],
    ['Sugar', 'Madhur', '1 kg', 60, 54, '🍚', VEGAN_GF],
    ['Extra Virgin Olive Oil', 'Figaro', '500 ml', 699, 589, '🫒', [...VEGAN_GF, 'KETO']],
  ],
  'sauces-spreads': [
    ['Tomato Ketchup', 'Kissan', '850 g', 150, 135, '🍅', VEGAN_GF],
    ['Eggless Mayonnaise', "Dr. Oetker FunFoods", '250 g', 99, 89, '🥫', [...VEG, 'EGG_FREE'], ['MILK']],
    ['Mixed Fruit Jam', 'Kissan', '500 g', 175, 159, '🍓', VEGAN_GF],
    ['Hazelnut Cocoa Spread', 'Nutella', '350 g', 399, 359, '🍫', VEG, ['TREE_NUTS', 'MILK', 'SOY']],
    ['Schezwan Chutney', "Ching's Secret", '250 g', 99, 89, '🌶️', VEGAN],
    ['Pure Honey', 'Dabur', '500 g', 299, 249, '🍯', [...VEG, 'GLUTEN_FREE']],
    ['Soy Sauce Dark', "Ching's Secret", '200 g', 75, 68, '🥢', VEGAN, ['SOY', 'WHEAT']],
  ],
  'organic-healthy': [
    ['Organic Jaggery Powder', '24 Mantra', '500 g', 120, 99, '🟫', [...VEGAN_GF, 'ORGANIC']],
    ['Chia Seeds', 'True Elements', '250 g', 249, 199, '🌱', [...VEGAN_GF, 'ORGANIC', 'HIGH_PROTEIN', 'KETO']],
    ['Protein Bar Peanut Butter', 'RiteBite Max', '70 g', 120, 108, '💪', [...VEG, 'HIGH_PROTEIN'], ['PEANUTS', 'MILK', 'SOY']],
    ['Organic Brown Rice', '24 Mantra', '1 kg', 175, 155, '🍚', [...VEGAN_GF, 'ORGANIC']],
    ['Almonds California', 'Happilo', '200 g', 350, 279, '🌰', [...VEGAN_GF, 'KETO', 'HIGH_PROTEIN'], ['TREE_NUTS']],
    ['Tofu Firm', 'Urban Platter', '200 g', 120, 109, '⬜', [...VEGAN_GF, 'HIGH_PROTEIN'], ['SOY']],
    ['Millet Muesli', 'Slurrp Farm', '400 g', 349, 299, '🥣', [...VEG, 'GLUTEN_FREE']],
  ],
  'meat-fish': [
    ['Chicken Curry Cut', 'Licious', '500 g', 249, 219, '🍗', ['GLUTEN_FREE', 'HIGH_PROTEIN', 'KETO', 'HALAL']],
    ['Chicken Breast Boneless', 'Licious', '450 g', 329, 289, '🍗', ['GLUTEN_FREE', 'HIGH_PROTEIN', 'KETO', 'HALAL']],
    ['Mutton Curry Cut', 'Licious', '500 g', 699, 649, '🥩', ['GLUTEN_FREE', 'HIGH_PROTEIN', 'KETO', 'HALAL']],
    ['Rohu Fish Curry Cut', 'FreshToHome', '500 g', 299, 259, '🐟', ['GLUTEN_FREE', 'HIGH_PROTEIN'], ['FISH']],
    ['Prawns Medium Cleaned', 'FreshToHome', '250 g', 349, 319, '🦐', ['GLUTEN_FREE', 'HIGH_PROTEIN'], ['SHELLFISH']],
    ['Chicken Seekh Kebab', 'Licious', '250 g', 229, 199, '🍢', ['HIGH_PROTEIN', 'HALAL']],
  ],
  'frozen-food': [
    ['Green Peas Frozen', 'Safal', '500 g', 120, 105, '🫛', VEGAN_GF],
    ['French Fries', 'McCain', '420 g', 145, 130, '🍟', VEGAN_GF],
    ['Aloo Tikki', 'McCain', '400 g', 160, 145, '🥔', VEG],
    ['Chicken Nuggets', 'ITC Master Chef', '450 g', 299, 269, '🍗', ['HIGH_PROTEIN'], ['WHEAT']],
    ['Malabar Paratha', 'iD Fresh', '5 pcs', 100, 90, '🫓', VEG, ['WHEAT']],
    ['Veg Momos', 'Prasuma', '24 pcs', 260, 235, '🥟', VEG, ['WHEAT']],
  ],
  'personal-care': [
    ['Moisturising Soap', 'Dove', '3 x 100 g', 200, 175, '🧼', VEG],
    ['Anti-Dandruff Shampoo', 'Head & Shoulders', '340 ml', 410, 365, '🧴', VEG],
    ['Toothpaste Strong Teeth', 'Colgate', '2 x 150 g', 230, 199, '🪥', VEG],
    ['Hand Wash Refill', 'Dettol', '675 ml', 129, 115, '🧴', VEG],
    ['Body Lotion Cocoa Glow', 'Vaseline', '400 ml', 399, 339, '🧴', VEG],
    ['Sanitary Pads XL', 'Whisper', '30 pads', 399, 349, '🌸', VEG],
    ['Face Wash Neem', 'Himalaya', '150 ml', 220, 189, '🌿', VEG],
    ['Shaving Foam', 'Gillette', '418 g', 299, 269, '🪒', VEG],
  ],
  'baby-care': [
    ['Baby Diapers Medium', 'Pampers', '40 pcs', 899, 749, '🍼', VEG],
    ['Baby Wipes', 'Himalaya', '72 pcs', 199, 175, '🧻', VEG],
    ['Cerelac Wheat Apple', 'Nestlé', '300 g', 285, 270, '🥣', VEG, ['MILK', 'WHEAT']],
    ['Baby Lotion', "Johnson's", '200 ml', 260, 235, '🧴', VEG],
  ],
  'cleaning-essentials': [
    ['Surf Excel Matic Liquid', 'Surf Excel', '2 L', 499, 435, '🧺', VEG],
    ['Dishwash Gel Lemon', 'Vim', '750 ml', 175, 155, '🍋', VEG],
    ['Floor Cleaner Lavender', 'Lizol', '975 ml', 229, 199, '🧽', VEG],
    ['Toilet Cleaner', 'Harpic', '1 L', 215, 189, '🚽', VEG],
    ['Garbage Bags Medium', 'Ezee', '30 bags', 120, 99, '🗑️', VEG],
    ['Kitchen Towel Rolls', 'Origami', '2 rolls', 160, 135, '🧻', VEG],
    ['Mosquito Repellent Refill', 'Good Knight', '45 ml', 95, 89, '🦟', VEG],
  ],
  'pet-care': [
    ['Adult Dog Food Chicken', 'Pedigree', '1.2 kg', 410, 365, '🐶', []],
    ['Cat Food Ocean Fish', 'Whiskas', '1.2 kg', 499, 449, '🐱', [], ['FISH']],
    ['Dog Treats Dentastix', 'Pedigree', '7 sticks', 199, 179, '🦴', []],
  ],
};

/** Valid EAN-13 barcode with the Indian GS1 prefix 890. */
export function ean13(sequence: number): string {
  const body = `890${String(1000000 + sequence).padStart(9, '0')}`.slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}
