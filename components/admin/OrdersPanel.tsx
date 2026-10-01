"use client";

import { useMemo, useState } from "react";
import { Button, Spinner } from "@/components/ui/Button";
import { ProductImage } from "@/components/ui/ProductImage";
import { useShop } from "@/components/admin/useShop";
import { removeOrder, updateOrderStatus } from "@/lib/services/shop";
import {
  countByStatus,
  countOpenOrders,
  deliveredRevenue,
  formatDZD,
  ordersToday,
  prettyPhone,
  timeAgo,
  whatsappOrderLink,
} from "@/lib/format";
import { cx } from "@/lib/cx";
import {
  DELIVERY_LABELS,
  ORDER_STATUSES,
  SIZE_LABELS,
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
} from "@/lib/types";
import type { Order, OrderStatus, ShopData } from "@/lib/types";

/**
 * Orders management.
 *
 * Layout: stat cards on top, then a filterable list. The list is a set of cards
 * rather than a real `<table>` on purpose — the shop owner checks orders on a
 * phone, and a 9-column table on a 360 px screen is unusable. Every field the
 * brief asks for is present, just stacked.
 */
export function OrdersPanel({ initial }: { initial: ShopData }) {
  const { data, error, refresh } = useShop(initial);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const orders = data.orders;
  const stats = useMemo(() => countByStatus(orders), [orders]);
  const today = useMemo(() => ordersToday(orders), [orders]);

  const visible = useMemo(() => {
    const list = filter === "all" ? orders : orders.filter((o) => o.status === filter);
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [orders, filter]);

  async function changeStatus(order: Order, status: OrderStatus) {
    setBusyId(order.id);
    setActionError(null);
    try {
      await updateOrderStatus(order.id, status);
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Mise à jour impossible.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(order: Order) {
    if (confirmDelete !== order.id) {
      setConfirmDelete(order.id);
      return;
    }
    setBusyId(order.id);
    setActionError(null);
    try {
      await removeOrder(order.id);
      setConfirmDelete(null);
      await refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Suppression impossible.");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <PanelError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      {/* ---- Stat cards ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Commandes" value={String(orders.length)} sub="depuis la création" />
        <StatCard label="Aujourd'hui" value={String(today.length)} sub="nouvelles commandes" accent />
        <StatCard label="À traiter" value={String(countOpenOrders(orders))} sub="en cours" />
        <StatCard label="Livrées" value={formatDZD(deliveredRevenue(orders))} sub="chiffre d'affaires" />
      </div>

      {/* ---- Filters ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Toutes ({orders.length})
        </FilterChip>
        {ORDER_STATUSES.map((status) => (
          <FilterChip
            key={status}
            active={filter === status}
            onClick={() => setFilter(status)}
            count={stats[status]}
          >
            {STATUS_LABELS[status].fr}
          </FilterChip>
        ))}
      </div>

      {actionError ? (
        <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      {/* ---- List ---- */}
      {visible.length === 0 ? (
        <EmptyState
          title="Aucune commande"
          body={
            filter === "all"
              ? "Les commandes posées depuis la boutique apparaîtront ici."
              : "Aucune commande dans cet état."
          }
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((order) => (
            <li key={order.id}>
              <OrderCard
                order={order}
                busy={busyId === order.id}
                confirmingDelete={confirmDelete === order.id}
                onStatusChange={(status) => changeStatus(order, status)}
                onDelete={() => handleDelete(order)}
                onCancelDelete={() => setConfirmDelete(null)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({
  order,
  busy,
  confirmingDelete,
  onStatusChange,
  onDelete,
  onCancelDelete,
}: {
  order: Order;
  busy: boolean;
  confirmingDelete: boolean;
  onStatusChange: (status: OrderStatus) => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/70">
      {/* ---- Summary row ---- */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-wider text-gold-300">
              {order.reference}
            </span>
            <StatusBadge status={order.status} />
            <span className="text-xs text-cream-300/45">{timeAgo(order.createdAt)}</span>
          </div>

          <p className="mt-2 truncate text-sm font-medium text-cream-50">{order.customerName}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cream-300/60">
            <a href={`tel:${order.phone}`} className="hover:text-gold-300">
              {prettyPhone(order.phone)}
            </a>
            <span>
              {order.wilayaName}
              {order.commune ? ` · ${order.commune}` : ""}
            </span>
            <span className="flex items-center gap-1">
              {DELIVERY_LABELS[order.deliveryType].fr === "Livraison au bureau" ? "Bureau" : "Domicile"}
            </span>
          </div>

          <p className="mt-1.5 text-xs text-cream-300/60">
            {order.items.map((i) => `${i.productTitle} · ${SIZE_LABELS[i.size].fr} × ${i.quantity}`).join(", ")}
          </p>
        </div>

        <div className="text-right">
          <p className="font-display text-xl font-semibold text-gold-300">
            {formatDZD(order.total)}
          </p>
          <p className="text-xs text-cream-300/50">
            dont {formatDZD(order.shippingPrice)} livraison
          </p>
        </div>
      </div>

      {/* ---- Actions ---- */}
      <div className="flex flex-wrap items-center gap-2 border-t border-ink-700/80 bg-ink-950/40 px-4 py-3">
        <label className="sr-only-focusable" htmlFor={`status-${order.id}`}>
          Changer le statut de la commande {order.reference}
        </label>
        <select
          id={`status-${order.id}`}
          value={order.status}
          disabled={busy}
          onChange={(e) => onStatusChange(e.target.value as OrderStatus)}
          className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-cream-100 outline-none focus:border-gold-500 disabled:opacity-50"
        >
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status].fr}
            </option>
          ))}
        </select>

        <a
          href={whatsappOrderLink(order.phone, order.reference)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-ink-600 px-3 py-2 text-xs text-cream-200/80 transition hover:border-emerald-500/60 hover:text-emerald-300"
        >
          WhatsApp
        </a>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="rounded-lg px-2 py-2 text-xs text-cream-300/60 transition hover:text-cream-50"
        >
          {expanded ? "Masquer" : "Détails"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="text-xs text-danger">Confirmer ?</span>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="rounded-lg bg-danger/20 px-3 py-2 text-xs text-danger ring-1 ring-danger/40 transition hover:bg-danger/30"
              >
                {busy ? <Spinner className="h-3 w-3" /> : "Supprimer"}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className="rounded-lg px-2 py-2 text-xs text-cream-300/60 hover:text-cream-50"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="rounded-lg px-2 py-2 text-xs text-cream-300/50 transition hover:text-danger"
            >
              Supprimer
            </button>
          )}
        </div>
      </div>

      {/* ---- Details ---- */}
      {expanded ? (
        <div className="grid gap-4 border-t border-ink-700/80 p-4 sm:grid-cols-2">
          <div>
            <h3 className="eyebrow mb-2">Client</h3>
            <dl className="space-y-1 text-xs text-cream-300/70">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-cream-300/45">Nom</dt>
                <dd>{order.customerName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-cream-300/45">Téléphone</dt>
                <dd>
                  <a href={`tel:${order.phone}`} className="hover:text-gold-300">
                    {prettyPhone(order.phone)}
                  </a>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-cream-300/45">Wilaya</dt>
                <dd>
                  {order.wilayaName} (code {order.wilayaCode})
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-cream-300/45">Commune</dt>
                <dd>{order.commune || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-cream-300/45">Livraison</dt>
                <dd>
                  {DELIVERY_LABELS[order.deliveryType].fr} —{" "}
                  {DELIVERY_LABELS[order.deliveryType].ar}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="eyebrow mb-2">Article</h3>
            <ul className="space-y-2">
              {order.items.map((item) => (
                <li key={item.productId} className="flex gap-3">
                  <ProductImage
                    src={item.productImage}
                    alt={item.productTitle}
                    className="h-14 w-11 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 text-xs">
                    <p className="truncate text-cream-100">{item.productTitle}</p>
                    <p className="text-cream-300/55">
                      Taille {SIZE_LABELS[item.size].fr} · Qté {item.quantity}
                    </p>
                    <p className="text-cream-300/55">
                      {formatDZD(item.unitPrice)} × {item.quantity} ={" "}
                      {formatDZD(item.unitPrice * item.quantity)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-1 border-t border-ink-700 pt-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-cream-300/45">Sous-total</dt>
                <dd>{formatDZD(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-cream-300/45">Livraison</dt>
                <dd>{order.shippingPrice === 0 ? "Gratuit" : formatDZD(order.shippingPrice)}</dd>
              </div>
              <div className="flex justify-between text-sm font-semibold text-gold-300">
                <dt>Total</dt>
                <dd>{formatDZD(order.total)}</dd>
              </div>
            </dl>
          </div>

          {order.note ? (
            <div className="sm:col-span-2 rounded-xl bg-ink-800/70 p-3">
              <h3 className="eyebrow mb-1">Note du client</h3>
              <p className="text-xs whitespace-pre-line text-cream-200/80">{order.note}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium ring-1",
        STATUS_BADGE_CLASS[status],
      )}
    >
      {STATUS_LABELS[status].fr}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border p-4",
        accent
          ? "border-gold-500/40 bg-gold-500/8"
          : "border-ink-700 bg-ink-900/70",
      )}
    >
      <p className="text-[0.65rem] font-light tracking-[0.2em] text-cream-300/55 uppercase">
        {label}
      </p>
      <p
        className={cx(
          "mt-1 font-display text-2xl font-semibold",
          accent ? "text-gold-300" : "text-cream-50",
        )}
      >
        {value}
      </p>
      <p className="text-xs text-cream-300/45">{sub}</p>
    </div>
  );
}

export function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/40 bg-danger/8 p-6 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry ? (
        <Button variant="dark" size="sm" onClick={onRetry} className="mt-4">
          Réessayer
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-600 p-12 text-center">
      <p className="font-display text-xl font-semibold text-cream-100">{title}</p>
      <p className="mt-2 text-sm text-cream-300/60">{body}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
        active
          ? "border-gold-500 bg-gold-500/15 text-gold-200"
          : "border-ink-600 bg-ink-800/60 text-cream-200/75 hover:border-gold-600/60",
      )}
    >
      {children}
      {count !== undefined ? (
        <span className="rounded-full bg-ink-900/60 px-1.5 text-[0.6rem] tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}
