import { WILAYAS } from "@/lib/wilayas";
import type { DeliveryType, ShippingRate } from "@/lib/types";

/**
 * Default delivery prices (DZD) per wilaya, in the format
 * `[wilayaCode, homePrice, officePrice]`.
 *
 * These are the starting values baked into a fresh install. Every one of them is
 * editable at runtime from `/admin/shipping`, so these are only a sensible
 * default (roughly what a desk / door-to-door courier charges) — never a hard
 * constraint.
 */
const DEFAULT_TABLE: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1000, 650], // Adrar
  [2, 600, 400], // Chlef
  [3, 750, 450], // Laghouat
  [4, 650, 400], // Oum El Bouaghi
  [5, 650, 400], // Batna
  [6, 550, 350], // Béjaïa
  [7, 800, 500], // Biskra
  [8, 950, 600], // Béchar
  [9, 400, 300], // Blida
  [10, 500, 350], // Bouira
  [11, 1400, 900], // Tamanrasset
  [12, 700, 450], // Tébessa
  [13, 650, 400], // Tlemcen
  [14, 650, 400], // Tiaret
  [15, 500, 350], // Tizi Ouzou
  [16, 400, 300], // Alger
  [17, 800, 500], // Djelfa
  [18, 650, 400], // Jijel
  [19, 600, 400], // Sétif
  [20, 650, 400], // Saïda
  [21, 650, 400], // Skikda
  [22, 700, 450], // Sidi Bel Abbès
  [23, 650, 400], // Annaba
  [24, 650, 400], // Guelma
  [25, 600, 400], // Constantine
  [26, 550, 350], // Médéa
  [27, 600, 400], // Mostaganem
  [28, 700, 450], // M'Sila
  [29, 650, 400], // Mascara
  [30, 950, 600], // Ouargla
  [31, 550, 350], // Oran
  [32, 800, 500], // El Bayadh
  [33, 1500, 950], // Illizi
  [34, 600, 400], // Bordj Bou Arréridj
  [35, 400, 300], // Boumerdès
  [36, 700, 450], // El Tarf
  [37, 1200, 750], // Tindouf
  [38, 650, 400], // Tissemsilt
  [39, 800, 500], // El Oued
  [40, 700, 450], // Khenchela
  [41, 700, 450], // Souk Ahras
  [42, 450, 300], // Tipaza
  [43, 600, 400], // Mila
  [44, 550, 350], // Aïn Defla
  [45, 900, 550], // Naâma
  [46, 600, 400], // Aïn Témouchent
  [47, 850, 500], // Ghardaïa
  [48, 600, 400], // Relizane
  [49, 1100, 700], // Timimoun
  [50, 1600, 1000], // Bordj Badji Mokhtar
  [51, 900, 550], // Ouled Djellal
  [52, 1100, 700], // Béni Abbès
  [53, 1100, 700], // In Salah
  [54, 1600, 1000], // In Guezzam
  [55, 900, 550], // Touggourt
  [56, 1700, 1100], // Djanet
  [57, 950, 600], // El M'Ghair
  [58, 1000, 650], // El Meniaa
];

/** Fallback used if a wilaya is somehow missing from the table. */
const FALLBACK_RATE = { home: 700, office: 450 };

/**
 * Home delivery is free above this basket total (DZD).
 * A strong conversion lever for an Algerian marketplace, where COD orders with
 * high shipping fees are the #1 reason for abandoned carts.
 */
export const FREE_SHIPPING_THRESHOLD = 8000;

/** The 58 default rates, one per wilaya, ordered by wilaya code. */
export function defaultShippingRates(): ShippingRate[] {
  return WILAYAS.map((w) => {
    const row = DEFAULT_TABLE.find(([code]) => code === w.code);
    return {
      wilayaCode: w.code,
      home: row?.[1] ?? FALLBACK_RATE.home,
      office: row?.[2] ?? FALLBACK_RATE.office,
    };
  });
}

/** Price of one delivery for a wilaya, falling back gracefully on bad input. */
export function rateFor(rates: ShippingRate[], wilayaCode: number, type: DeliveryType): number {
  const rate = rates.find((r) => r.wilayaCode === wilayaCode);
  if (!rate) return FALLBACK_RATE[type];
  const value = rate[type];
  return typeof value === "number" && Number.isFinite(value) ? value : FALLBACK_RATE[type];
}

export type ShippingBreakdown = {
  /** Raw courier price for the chosen wilaya + delivery method. */
  base: number;
  /** Price actually charged to the customer (0 when the free-shipping threshold is met). */
  price: number;
  /** True when the basket qualifies for free home delivery. */
  isFree: boolean;
  /** How much the customer still has to add to unlock free delivery (0 when already free). */
  remainingForFree: number;
};

/**
 * Computes the shipping line of an order.
 *
 * Free delivery only applies to `home` deliveries: the desk pickup price is
 * already cheap, and desk shipping is what the shop itself pays for.
 */
export function calculateShipping(
  rates: ShippingRate[],
  wilayaCode: number,
  type: DeliveryType,
  subtotal: number,
): ShippingBreakdown {
  const base = rateFor(rates, wilayaCode, type);
  const qualifies = type === "home" && subtotal >= FREE_SHIPPING_THRESHOLD;
  return {
    base,
    price: qualifies ? 0 : base,
    isFree: qualifies,
    remainingForFree: qualifies ? 0 : Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal),
  };
}
