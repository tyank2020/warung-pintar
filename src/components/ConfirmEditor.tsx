import type { ConfirmItem, Product } from "../lib/types"
import { numberID, productLabel, rupiah } from "../lib/format"
import { Icon } from "./Icon"

interface ConfirmEditorProps {
  items: ConfirmItem[]
  products: Product[]
  mode: "sale" | "purchase" | "utang"
  onChange: (items: ConfirmItem[]) => void
}

export function ConfirmEditor({ items, products, mode, onChange }: ConfirmEditorProps) {
  const update = (key: string, patch: Partial<ConfirmItem>) => {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const remove = (key: string) => {
    onChange(items.filter((item) => item.key !== key))
  }

  const addRow = () => {
    onChange([
      ...items,
      {
        key: `manual-${crypto.randomUUID()}`,
        productId: "",
        name: "",
        qty: 1,
        unit: "pcs",
        unitPrice: 0,
        isNew: false,
        size: null,
        brand: null,
      },
    ])
  }

  const requested = new Map<string, number>()
  for (const item of items) {
    if (!item.productId) continue
    requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.qty)
  }

  return (
    <div className="confirm-editor">
      <div className="confirm-head">
        <span>Barang</span>
        <span>Jumlah</span>
        <span>{mode === "sale" ? "Harga jual" : mode === "utang" ? "Harga" : "Harga modal"}</span>
        <span>Subtotal</span>
        <span />
      </div>

      {items.length === 0 && (
        <div className="confirm-empty">
          <Icon name="search" size={22} />
          <strong>Belum ada barang</strong>
          <span>Tambahkan barang secara manual atau ulangi rekaman.</span>
        </div>
      )}

      {items.map((item) => {
        const product = products.find((candidate) => candidate.id === item.productId)
        const subtotal = item.qty * item.unitPrice
        const requestedQty = product ? (requested.get(product.id) ?? item.qty) : item.qty
        const stockAfter =
          product && mode !== "utang"
            ? mode === "sale"
              ? product.stock - requestedQty
              : product.stock + requestedQty
            : null
        const unitMismatch = product && item.unit && item.unit !== product.unit
        const insufficient = mode === "sale" && product ? requestedQty > product.stock : false

        return (
          <div className="confirm-row" key={item.key}>
            <div className="confirm-product">
              <select
                value={item.isNew ? "__new__" : item.productId}
                onChange={(event) => {
                  if (event.target.value === "__new__") {
                    update(item.key, {
                      productId: "",
                      isNew: true,
                      name: item.name || "Produk baru",
                      unit: item.unit || "pcs",
                      unitPrice: item.unitPrice,
                      size: item.size ?? null,
                      brand: item.brand ?? null,
                      newSellPrice:
                        item.newSellPrice ?? Math.round((item.unitPrice || 0) * 1.15),
                    })
                    return
                  }
                  const next = products.find((candidate) => candidate.id === event.target.value)
                  if (!next) {
                    update(item.key, { productId: "", name: "", isNew: false, size: null, brand: null })
                    return
                  }
                  update(item.key, {
                    productId: next.id,
                    name: next.name,
                    unit: next.unit,
                    unitPrice: mode === "sale" ? next.sell_price : next.buy_price,
                    isNew: false,
                    size: next.size ?? null,
                    brand: next.brand ?? null,
                  })
                }}
                aria-label={`Pilih barang untuk ${item.name || "baris ini"}`}
              >
                <option value="">Pilih barang…</option>
                {mode === "purchase" && <option value="__new__">Buat produk baru…</option>}
                {products.map((candidate) => (
                  <option value={candidate.id} key={candidate.id}>
                    {productLabel(candidate)}
                  </option>
                ))}
              </select>
              {item.isNew && (
                <div className="new-product-fields">
                  <input
                    value={item.name}
                    onChange={(event) => update(item.key, { name: event.target.value })}
                    placeholder="Nama produk baru"
                    aria-label="Nama produk baru"
                  />
                  <input
                    value={item.size ?? ""}
                    onChange={(event) => update(item.key, { size: event.target.value || null })}
                    placeholder="Ukuran / varian — mis. 2 Liter, 500 gram (opsional)"
                    aria-label="Ukuran atau varian produk baru"
                  />
                  <input
                    value={item.brand ?? ""}
                    onChange={(event) => update(item.key, { brand: event.target.value || null })}
                    placeholder="Merek — mis. Bimoli, Wings (opsional)"
                    aria-label="Merek produk baru"
                  />
                  <div>
                    <label>
                      Harga jual
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={item.newSellPrice ?? 0}
                        onChange={(event) =>
                          update(item.key, {
                            newSellPrice: Number(event.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <label>
                      Satuan
                      <select
                        value={item.unit}
                        onChange={(event) => update(item.key, { unit: event.target.value })}
                      >
                        {["pcs", "kg", "liter", "dus", "bungkus", "papan", "sachet"].map(
                          (unit) => (
                            <option value={unit} key={unit}>
                              {unit}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                </div>
              )}
              <div className="confirm-meta">
                {product ? (
                  <>
                    <span>
                      Stok {numberID(product.stock)} {product.unit}
                      {stockAfter !== null && (
                        <b className={insufficient ? "danger" : ""}>
                          {" "}
                          → {numberID(stockAfter)} {product.unit}
                        </b>
                      )}
                    </span>
                    {unitMismatch && (
                      <span className="confirm-warning">
                        <Icon name="warning" size={12} /> AI menyebut “{item.unit}”, produk memakai{" "}
                        {product.unit}. Periksa jumlahnya.
                      </span>
                    )}
                    {insufficient && (
                      <span className="confirm-warning">
                        <Icon name="warning" size={12} /> Stok tidak cukup.
                      </span>
                    )}
                  </>
                ) : item.isNew ? (
                  <span className="confirm-new">
                    <Icon name="plus" size={12} /> Produk baru · stok menjadi{" "}
                    {numberID(item.qty)} {item.unit}
                  </span>
                ) : (
                  <span className="confirm-warning">
                    <Icon name="warning" size={12} /> Barang belum cocok. Pilih dari daftar atau
                    buat produk baru.
                  </span>
                )}
                {typeof item.confidence === "number" && (
                  <span className={`confidence ${item.confidence < 0.7 ? "low" : ""}`}>
                    {item.confidence < 0.7 ? "Perlu dicek" : "Yakin"} ·{" "}
                    {Math.round(item.confidence * 100)}%
                  </span>
                )}
                {item.size && <span className="size-chip">{item.size}</span>}
                {item.brand && <span className="size-chip brand-chip">{item.brand}</span>}
              </div>
            </div>

            <div className="confirm-qty">
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.qty}
                onChange={(event) =>
                  update(item.key, { qty: Number(event.target.value) || 0 })
                }
                aria-label={`Jumlah ${item.name}`}
              />
              <small>{product?.unit ?? item.unit}</small>
            </div>

            <div className="confirm-price">
              <input
                type="number"
                min="0"
                step="100"
                value={item.unitPrice}
                onChange={(event) =>
                  update(item.key, { unitPrice: Number(event.target.value) || 0 })
                }
                aria-label={`Harga satuan ${item.name}`}
              />
              <small>{rupiah(item.unitPrice)}</small>
            </div>

            <strong className="confirm-subtotal">{rupiah(subtotal)}</strong>

            <button
              className="confirm-remove"
              onClick={() => remove(item.key)}
              aria-label={`Hapus ${item.name || "baris"}`}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        )
      })}

      <button className="confirm-add" onClick={addRow}>
        <Icon name="plus" size={16} /> Tambah barang
      </button>
    </div>
  )
}

export function confirmTotal(items: ConfirmItem[]) {
  return items.reduce((total, item) => total + item.qty * item.unitPrice, 0)
}

export function confirmIsValid(
  items: ConfirmItem[],
  products: Product[],
  mode: "sale" | "purchase" | "utang",
) {
  if (items.length === 0) return false

  const requested = new Map<string, number>()
  for (const item of items) {
    if (!Number.isFinite(item.qty) || item.qty <= 0) return false
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) return false

    if (item.isNew) {
      // Utang boleh memakai nama bebas (barang belum terdaftar) selama
      // namanya jelas. Produk baru yang tersimpan tetap hanya untuk pembelian.
      if (mode === "utang") {
        if (!item.name.trim()) return false
        continue
      }
      if (mode !== "purchase" || !item.name.trim() || item.unitPrice <= 0) return false
      continue
    }

    // Utang tidak menyentuh stok, jadi barang boleh belum terdaftar.
    if (mode === "utang") {
      if (!item.name.trim()) return false
      continue
    }

    const product = products.find((candidate) => candidate.id === item.productId)
    if (!product) return false
    requested.set(product.id, (requested.get(product.id) ?? 0) + item.qty)
  }

  if (mode === "sale") {
    for (const [productId, qty] of requested) {
      const product = products.find((candidate) => candidate.id === productId)
      if (product && qty > product.stock) return false
    }
  }

  return true
}
