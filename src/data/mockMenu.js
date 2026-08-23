/**
 * mockMenu.js — structured mock menu data for Lumière restaurant.
 *
 * Admin-readiness note:
 *   imageUrl on both items and categories is an editable field.
 *   It will be surfaced in the Admin Product Management and Category Management
 *   screens in a future phase. Nothing here is hardcoded in a way that prevents
 *   future admin updates — the field is simply stored on the record.
 *
 *   Item imageUrl:     shown immediately on the product card.
 *   Category imageUrl: data structure prepared; not rendered until Admin phase.
 *
 *   Fallback rule: if imageUrl is null, empty, or the image fails to load,
 *   the product card shows the category emoji as a premium placeholder.
 *   This fallback is handled in CustomerMenuScreen and requires no data changes.
 */

/* Convenience builder — keeps URLs short and consistent in this file.
   Swap the base URL here when moving to a CDN/admin-uploaded assets. */
const img = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&h=300&q=80`;

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

export const CATEGORIES = [
  {
    id: "cat_starters",
    name: "Starters",
    emoji: "🥗",
    /* imageUrl: future admin-editable category header image (not rendered yet) */
    imageUrl: img("1626957341782-1e12477ad2a4"),
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "cat_mains",
    name: "Mains",
    emoji: "🍽️",
    imageUrl: img("1504674900247-0877df9cc836"),
    sortOrder: 2,
    isActive: true,
  },
  {
    id: "cat_pasta",
    name: "Pasta",
    emoji: "🍝",
    imageUrl: img("1555396273-367ea4eb4db5"),
    sortOrder: 3,
    isActive: true,
  },
  {
    id: "cat_burgers",
    name: "Burgers",
    emoji: "🍔",
    imageUrl: img("1551782450-a2132b4ba21d"),
    sortOrder: 4,
    isActive: true,
  },
  {
    id: "cat_desserts",
    name: "Desserts",
    emoji: "🍮",
    imageUrl: img("1612929634808-9b04af62e0d8"),
    sortOrder: 5,
    isActive: true,
  },
  {
    id: "cat_drinks",
    name: "Drinks",
    emoji: "🥤",
    imageUrl: img("1514362545857-73d02a8a2929"),
    sortOrder: 6,
    isActive: true,
  },
];

// ─── MENU ITEMS ───────────────────────────────────────────────────────────────

export const MENU_ITEMS = [

  // ── Starters ──────────────────────────────────────────────────────────────
  {
    id: "item_s01",
    categoryId: "cat_starters",
    name: "Burrata & Heirloom Tomato",
    description: "Creamy burrata, heirloom tomatoes, fresh basil oil, sea salt flakes",
    price: 8.5,
    imageUrl: img("1546069901-ba9599a7e63c"),
    isAvailable: true,
    isPopular: true,
    isFeatured: true,
    sortOrder: 1,
    removableIngredients: ["basil oil", "sea salt flakes"],
    choices: [],
    paidAddOns: [
      { id: "ao_extra_burrata",  name: "Extra burrata",        price: 3.0 },
      { id: "ao_truffle_oil",    name: "Truffle oil drizzle",  price: 1.5 },
    ],
  },
  {
    id: "item_s02",
    categoryId: "cat_starters",
    name: "Crispy Calamari",
    description: "Lightly dusted, flash-fried, served with lemon aioli and chilli flakes",
    price: 7.0,
    imageUrl: img("1599487488170-d11ec9c172f0"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 2,
    removableIngredients: ["chilli flakes"],
    choices: [
      {
        id: "choice_dip",
        name: "Dipping sauce",
        required: false,
        maxSelections: 1,
        options: [
          { id: "dip_aioli",  name: "Lemon aioli",  price: 0 },
          { id: "dip_tartar", name: "Tartare sauce", price: 0 },
          { id: "dip_spicy",  name: "Spicy harissa", price: 0 },
        ],
      },
    ],
    paidAddOns: [],
  },
  {
    id: "item_s03",
    categoryId: "cat_starters",
    name: "Chicken Liver Pâté",
    description: "Smooth house-made pâté, toasted brioche, cornichons, fig jam",
    price: 6.5,
    imageUrl: img("1579584425555-c3ce17fd4351"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 3,
    removableIngredients: ["cornichons", "fig jam"],
    choices: [],
    paidAddOns: [
      { id: "ao_extra_brioche", name: "Extra brioche slices", price: 1.0 },
    ],
  },

  // ── Mains ─────────────────────────────────────────────────────────────────
  {
    id: "item_m01",
    categoryId: "cat_mains",
    name: "Dry-Aged Ribeye",
    description: "300g 45-day dry-aged, truffle butter, crispy shallots, seasonal greens",
    price: 28.0,
    imageUrl: img("1558618666-fcd25c85cd64"),
    isAvailable: true,
    isPopular: true,
    isFeatured: true,
    sortOrder: 1,
    removableIngredients: ["truffle butter", "crispy shallots"],
    choices: [
      {
        id: "choice_doneness",
        name: "Doneness",
        required: true,
        maxSelections: 1,
        options: [
          { id: "rare",        name: "Rare",        price: 0 },
          { id: "medium_rare", name: "Medium rare", price: 0 },
          { id: "medium",      name: "Medium",      price: 0 },
          { id: "well_done",   name: "Well done",   price: 0 },
        ],
      },
      {
        id: "choice_sauce",
        name: "Sauce",
        required: false,
        maxSelections: 1,
        options: [
          { id: "sauce_peppercorn", name: "Peppercorn jus",     price: 0 },
          { id: "sauce_red_wine",   name: "Red wine reduction",  price: 0 },
          { id: "sauce_mushroom",   name: "Wild mushroom",       price: 0 },
          { id: "sauce_none",       name: "No sauce",            price: 0 },
        ],
      },
    ],
    paidAddOns: [
      { id: "ao_foie_gras",     name: "Seared foie gras",       price: 6.0 },
      { id: "ao_bone_marrow",   name: "Bone marrow",            price: 3.5 },
      { id: "ao_truffle_shav",  name: "Black truffle shavings", price: 5.0 },
    ],
  },
  {
    id: "item_m02",
    categoryId: "cat_mains",
    name: "Pan-Seared Salmon",
    description: "Atlantic salmon fillet, lemon beurre blanc, wilted spinach, capers",
    price: 18.0,
    imageUrl: img("1467003909585-2f8a72700288"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 2,
    removableIngredients: ["capers"],
    choices: [
      {
        id: "choice_sides",
        name: "Side",
        required: false,
        maxSelections: 1,
        options: [
          { id: "side_greens", name: "Seasonal greens", price: 0 },
          { id: "side_mash",   name: "Pomme purée",     price: 0 },
          { id: "side_frites", name: "Skinny fries",    price: 0 },
        ],
      },
    ],
    paidAddOns: [
      { id: "ao_extra_salmon", name: "Extra salmon portion", price: 8.0 },
    ],
  },
  {
    id: "item_m03",
    categoryId: "cat_mains",
    name: "Roasted Duck Breast",
    description: "Confit duck, cherry jus, pomme purée, seasonal greens",
    price: 22.0,
    imageUrl: img("1588166524941-3bf61a9c41db"),
    isAvailable: false,   /* currently out of stock */
    isPopular: false,
    isFeatured: false,
    sortOrder: 3,
    removableIngredients: [],
    choices: [],
    paidAddOns: [],
  },

  // ── Pasta ─────────────────────────────────────────────────────────────────
  {
    id: "item_p01",
    categoryId: "cat_pasta",
    name: "Black Truffle Tagliatelle",
    description: "Hand-rolled pasta, shaved black truffle, aged parmesan, light cream",
    price: 16.0,
    imageUrl: img("1551183053-bf91798d1af7"),
    isAvailable: true,
    isPopular: true,
    isFeatured: false,
    sortOrder: 1,
    removableIngredients: ["cream"],
    choices: [
      {
        id: "choice_protein",
        name: "Add protein",
        required: false,
        maxSelections: 1,
        options: [
          { id: "protein_none",    name: "No protein",     price: 0   },
          { id: "protein_chicken", name: "Grilled chicken", price: 3.5 },
          { id: "protein_shrimp",  name: "Tiger shrimp",   price: 5.0 },
        ],
      },
    ],
    paidAddOns: [
      { id: "ao_extra_truffle", name: "Extra truffle shavings", price: 4.0 },
      { id: "ao_extra_parm",    name: "Extra parmesan",          price: 1.0 },
    ],
  },
  {
    id: "item_p02",
    categoryId: "cat_pasta",
    name: "Cacio e Pepe",
    description: "Classic Roman pasta, Pecorino Romano, cracked black pepper",
    price: 11.0,
    imageUrl: img("1621996346565-ead8a175b60c"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 2,
    removableIngredients: [],
    choices: [],
    paidAddOns: [
      { id: "ao_guanciale",  name: "Guanciale",      price: 2.5 },
      { id: "ao_egg_yolk",   name: "Cured egg yolk", price: 1.5 },
    ],
  },

  // ── Burgers ───────────────────────────────────────────────────────────────
  {
    id: "item_b01",
    categoryId: "cat_burgers",
    name: "Wagyu Smash Burger",
    description: "Double wagyu patty, aged cheddar, caramelised onions, house sauce, brioche",
    price: 13.0,
    imageUrl: img("1568901346622-a6d8a94f5d05"),
    isAvailable: true,
    isPopular: true,
    isFeatured: false,
    sortOrder: 1,
    removableIngredients: ["caramelised onions", "house sauce"],
    choices: [
      {
        id: "choice_sauce",
        name: "Sauce",
        required: false,
        maxSelections: 2,
        options: [
          { id: "sauce_house",    name: "House sauce",   price: 0 },
          { id: "sauce_mustard",  name: "Dijon mustard", price: 0 },
          { id: "sauce_sriracha", name: "Sriracha mayo", price: 0 },
          { id: "sauce_none",     name: "No sauce",      price: 0 },
        ],
      },
      {
        id: "choice_bun",
        name: "Bun",
        required: false,
        maxSelections: 1,
        options: [
          { id: "bun_brioche", name: "Brioche bun", price: 0 },
          { id: "bun_lettuce", name: "Lettuce wrap", price: 0 },
        ],
      },
    ],
    paidAddOns: [
      { id: "ao_extra_patty",  name: "Extra patty",   price: 4.5 },
      { id: "ao_bacon",        name: "Crispy bacon",  price: 2.0 },
      { id: "ao_fried_egg",    name: "Fried egg",     price: 1.5 },
      { id: "ao_extra_cheese", name: "Extra cheese",  price: 1.0 },
    ],
  },
  {
    id: "item_b02",
    categoryId: "cat_burgers",
    name: "Crispy Chicken Sandwich",
    description: "Buttermilk fried chicken, slaw, cornichon pickles, hot honey",
    price: 10.0,
    imageUrl: img("1565299507177-b0ac66763828"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 2,
    removableIngredients: ["slaw", "hot honey", "cornichon pickles"],
    choices: [
      {
        id: "choice_heat",
        name: "Heat level",
        required: false,
        maxSelections: 1,
        options: [
          { id: "heat_mild",   name: "Mild",   price: 0 },
          { id: "heat_medium", name: "Medium", price: 0 },
          { id: "heat_hot",    name: "Hot 🌶️", price: 0 },
        ],
      },
    ],
    paidAddOns: [
      { id: "ao_extra_chicken", name: "Extra chicken piece", price: 3.5 },
      { id: "ao_avocado",       name: "Smashed avocado",     price: 2.0 },
    ],
  },

  // ── Desserts ──────────────────────────────────────────────────────────────
  {
    id: "item_d01",
    categoryId: "cat_desserts",
    name: "Crème Brûlée",
    description: "Classic vanilla bean custard, caramelised sugar crust, fresh seasonal berries",
    price: 5.5,
    imageUrl: img("1470124182917-cc6e71b22ecc"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 1,
    removableIngredients: ["berries"],
    choices: [],
    paidAddOns: [
      { id: "ao_ice_cream", name: "Vanilla ice cream scoop", price: 1.5 },
    ],
  },
  {
    id: "item_d02",
    categoryId: "cat_desserts",
    name: "Warm Chocolate Fondant",
    description: "72% dark chocolate, molten centre, vanilla ice cream, hazelnut praline",
    price: 6.5,
    imageUrl: img("1578985545062-69928b1d9587"),
    isAvailable: true,
    isPopular: true,
    isFeatured: false,
    sortOrder: 2,
    removableIngredients: ["hazelnut praline"],
    choices: [
      {
        id: "choice_ice_cream",
        name: "Ice cream flavour",
        required: false,
        maxSelections: 1,
        options: [
          { id: "ic_vanilla", name: "Vanilla",        price: 0 },
          { id: "ic_salted",  name: "Salted caramel", price: 0 },
          { id: "ic_none",    name: "No ice cream",   price: 0 },
        ],
      },
    ],
    paidAddOns: [
      { id: "ao_extra_scoop", name: "Extra ice cream scoop", price: 1.5 },
    ],
  },

  // ── Drinks ────────────────────────────────────────────────────────────────
  {
    id: "item_dr01",
    categoryId: "cat_drinks",
    name: "House Lemonade",
    description: "Freshly squeezed, rosemary syrup, sparkling water, mint",
    price: 2.5,
    imageUrl: img("1621263764928-df1444c5e859"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 1,
    removableIngredients: ["mint", "rosemary syrup"],
    choices: [
      {
        id: "choice_sugar",
        name: "Sweetness",
        required: false,
        maxSelections: 1,
        options: [
          { id: "sweet_less",    name: "Less sweet",  price: 0 },
          { id: "sweet_regular", name: "Regular",     price: 0 },
          { id: "sweet_more",    name: "Extra sweet", price: 0 },
        ],
      },
    ],
    paidAddOns: [],
  },
  {
    id: "item_dr02",
    categoryId: "cat_drinks",
    name: "Craft Beer — Local IPA",
    description: "Hoppy, citrusy local brew, 5.2% ABV, 330ml can",
    price: 4.0,
    imageUrl: img("1566633806327-68e152aaf26d"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 2,
    removableIngredients: [],
    choices: [],
    paidAddOns: [],
  },
  {
    id: "item_dr03",
    categoryId: "cat_drinks",
    name: "San Pellegrino Sparkling Water",
    description: "750ml bottle",
    price: 2.0,
    imageUrl: img("1576164645609-90c0b7c3a18"),
    isAvailable: true,
    isPopular: false,
    isFeatured: false,
    sortOrder: 3,
    removableIngredients: [],
    choices: [],
    paidAddOns: [],
  },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Count available items in a category. */
export function countByCategory(categoryId) {
  return MENU_ITEMS.filter(
    (i) => i.categoryId === categoryId && i.isAvailable
  ).length;
}

/** Total available items across all categories. */
export const TOTAL_AVAILABLE = MENU_ITEMS.filter((i) => i.isAvailable).length;
