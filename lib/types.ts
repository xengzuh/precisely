export type Product = {
  id: string
  name: string
  sku: string
  stock: number
  price: number
  created_at: string
}

export type Supplier = {
  id: string
  name: string
  email: string | null
  phone: string | null
  created_at: string
}

export type PurchaseOrder = {
  id: string
  supplier_id: string | null
  product_id: string | null
  quantity: number
  unit_cost: number | string
  total_cost: number | string
  status: string
  created_at: string
  suppliers: { name: string } | null
  products: { name: string } | null
}
