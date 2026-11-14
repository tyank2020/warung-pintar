import { useState } from "react"
import { useWarung } from "../lib/store"
import { Icon } from "./Icon"
import { Modal } from "./Modal"

const UNITS = ["pcs", "kg", "liter", "dus", "bungkus", "papan", "sachet", "botol", "kaleng"]

export function ProductModal({ onClose }: { onClose: () => void }) {
  const { addProduct } = useWarung()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [size, setSize] = useState("")
  const [brand, setBrand] = useState("")
  const [unit, setUnit] = useState("pcs")
  const [stock, setStock] = useState("0")
  const [minStock, setMinStock] = useState("0")
  const [buyPrice, setBuyPrice] = useState("")
  const [sellPrice, setSellPrice] = useState("")
  const [aliases, setAliases] = useState("")

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setSaving(true)
    try {
      await addProduct({
        name: name.trim(),
        size: size.trim() || null,
        brand: brand.trim() || null,
        unit,
        stock: Number(stock) || 0,
        min_stock: Number(minStock) || 0,
        buy_price: Number(buyPrice) || 0,
        sell_price: Number(sellPrice) || 0,
        aliases: aliases
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
      })
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gagal menyimpan barang.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal label="Tambah barang baru" onClose={onClose}>
      {saved ? (
          <div className="modal-success">
            <span className="success-orb">
              <Icon name="check" size={30} />
            </span>
            <span className="modal-kicker">TERSIMPAN</span>
            <h2>Barang berhasil ditambahkan</h2>
            <p>
              {name} sekarang muncul di daftar stok dan bisa dikenali lewat suara atau nota.
            </p>
            <button className="primary-action full" onClick={onClose}>
              Kembali ke stok <Icon name="arrow" size={17} />
            </button>
          </div>
        ) : (
          <>
            <span className="modal-kicker">BARANG BARU</span>
            <h2>Tambahkan ke inventori</h2>
            <p>
              Isi data dasar. Alias membantu AI mengenali nama lain, misalnya “gulpas” untuk Gula
              Pasir.
            </p>
            <form className="product-form" onSubmit={(event) => void handleSubmit(event)}>
              <label>
                Nama barang
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Contoh: Minyak Goreng"
                />
              </label>
              <label>
                Merek (opsional) — harga berbeda mengikuti merek
                <input
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  placeholder="Contoh: Bimoli, Wings"
                />
                <small>
                  Kalau ada "Minyak Goreng · 2 Liter" tanpa merek dan "Bimoli Minyak Goreng · 2 Liter",
                  itu dua barang dengan harga masing-masing.
                </small>
              </label>
              <label>
                Ukuran / varian (opsional) — stok dihitung terpisah
                <input
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  placeholder="Contoh: 2 Liter, 500 gram, 700 g"
                />
                <small>
                  Isi kalau nama yang sama punya varian ukuran berbeda — mis. “Minyak Goreng” 1 Liter
                  dan 2 Liter jadi dua barang terpisah di stok.
                </small>
              </label>
              <div>
                <label>
                  Stok awal
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={stock}
                    onChange={(event) => setStock(event.target.value)}
                    placeholder="0"
                  />
                </label>
                <label>
                  Satuan
                  <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                    {UNITS.map((option) => (
                      <option value={option} key={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div>
                <label>
                  Harga modal
                  <input
                    required
                    type="number"
                    min="0"
                    step="100"
                    value={buyPrice}
                    onChange={(event) => setBuyPrice(event.target.value)}
                    placeholder="Rp0"
                  />
                </label>
                <label>
                  Harga jual
                  <input
                    required
                    type="number"
                    min="0"
                    step="100"
                    value={sellPrice}
                    onChange={(event) => setSellPrice(event.target.value)}
                    placeholder="Rp0"
                  />
                </label>
              </div>
              <div>
                <label>
                  Stok minimum
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={minStock}
                    onChange={(event) => setMinStock(event.target.value)}
                    placeholder="0"
                  />
                </label>
                <label>
                  Alias (pisahkan dengan koma)
                  <input
                    value={aliases}
                    onChange={(event) => setAliases(event.target.value)}
                    placeholder="mis. gulpas, gula putih"
                  />
                </label>
              </div>
              {error && <div className="form-error">{error}</div>}
              <button type="submit" disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan barang"}
                {!saving && <Icon name="arrow" size={17} />}
              </button>
            </form>
          </>
        )}
    </Modal>
  )
}
