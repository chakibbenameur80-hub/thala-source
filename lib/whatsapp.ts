import { LINKS } from "@/lib/brand";
import { normalizePhone, prettyPhone } from "@/lib/format";
import { DELIVERY_LABELS, SIZE_LABELS } from "@/lib/types";
import { wilayaLabel } from "@/lib/wilayas";
import type { Order } from "@/lib/types";

/**
 * WhatsApp order confirmation message.
 *
 * Why this lives in its own module:
 *
 * WhatsApp is the confirmation channel for this shop. An order placed through the
 * checkout form is *also* saved to the database/localStorage, but that save is
 * invisible to the customer — they get a "thank you" screen and no proof the shop
 * received anything. Handing them a prefilled WhatsApp message closes that gap:
 * they send it with one tap, the shop has the details in the chat next to the
 * reference number, and the two records can be matched.
 *
 * It is written in Arabic because that is the language the customer is reading
 * the confirmation screen in, and it labels every field so the shop can read the
 * reply without asking a follow-up question.
 */

/**
 * Trims and collapses whitespace, and bounds the length.
 *
 * The newline flattening matters more than it looks: without it a customer who
 * pastes a multi-line note would inject literal line breaks into the `wa.me` URL.
 */
function clean(value: string | undefined | null, fallback = ""): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 200) || fallback;
}

/**
 * Formats the customer's phone number for display.
 *
 * `prettyPhone` returns the number unchanged unless it matches the exact
 * `^0\d{8}$` national format, and the stored value is not guaranteed to be in that
 * format (it may still carry a `+213` prefix or spaces). Normalising first means
 * the shop always receives a dialable national number rather than whatever the
 * customer typed.
 */
function displayPhone(phone: string): string {
  return prettyPhone(normalizePhone(phone));
}

/**
 * Builds the prefilled Arabic message for an order.
 *
 * Amounts are included even though the client's example message omitted them: the
 * customer confirming by message is the shop's only chance to catch a pricing
 * misunderstanding before dispatch, and omitting the total invites exactly the
 * "what do I owe?" exchange that costs a sale.
 */
export function whatsappOrderMessage(order: Order): string {
  const items = order.items
    .map((item) => {
      const size = SIZE_LABELS[item.size]?.ar ?? item.size;
      return `- ${clean(item.productTitle)} (${size}) × ${item.quantity}`;
    })
    .join("\n");

  const delivery = DELIVERY_LABELS[order.deliveryType]?.ar ?? order.deliveryType;
  const location = [wilayaLabel(order.wilayaCode), clean(order.commune)]
    .filter(Boolean)
    .join(" - ");

  const lines = [
    "مرحباً، أريد تأكيد طلبي من متجر Thala Source:",
    `الاسم: ${clean(order.customerName)}`,
    `الهاتف: ${displayPhone(order.phone)}`,
    `الولاية: ${clean(location, "—")}`,
    `التوصيل: ${delivery}`,
    `المنتج:\n${items || "-"}`,
    `الكمية: ${order.items.reduce((sum, item) => sum + item.quantity, 0)}`,
    `المجموع: ${order.total} دج`,
    `رقم الطلب: ${order.reference}`,
  ];

  if (order.note) {
    lines.push(`ملاحظة: ${clean(order.note)}`);
  }

  return lines.join("\n");
}

/**
 * Full `wa.me` deep link with the message pre-filled.
 *
 * `encodeURIComponent` is what makes this safe: without it the newlines become
 * literal spaces and an Arabic `&` or `#` would truncate the message at the
 * first ampersand.
 */
export function whatsappOrderLink(order: Order): string {
  return `${LINKS.whatsapp}?text=${encodeURIComponent(whatsappOrderMessage(order))}`;
}

/** Plain WhatsApp link with a short greeting, used outside an order context. */
export function whatsappContactLink(message?: string): string {
  if (!message) return LINKS.whatsapp;
  return `${LINKS.whatsapp}?text=${encodeURIComponent(message)}`;
}