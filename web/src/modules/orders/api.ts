import { api, type Paged } from '@/api/http'

export interface UserLite { id: number; name: string }
export interface StudentLite { id: number; name: string; studentNo: string }

export interface Product {
  id: number
  campusId: number | null
  campus?: { id: number; name: string } | null
  type: 'SINGLE' | 'PACKAGE'
  name: string
  category: string | null
  price: number
  originalPrice: number | null
  vipHours: number | null
  description: string | null
  active: boolean
  sort: number
  items: { id: number; name: string; price: number }[]
  itemIds: number[]
}

export interface ProductInput {
  type: 'SINGLE' | 'PACKAGE'
  name: string
  category: string | null
  price: number
  originalPrice: number | null
  vipHours: number | null
  description: string | null
  active: boolean
  sort: number
  campusId: number | null
  itemIds: number[]
}

export interface Payment {
  id: number
  orderId: number
  kind: string
  amount: number
  currency: string
  method: string
  paidAt: string
  payee?: UserLite | null
  receiptUrl: string | null
  note: string | null
  createdAt: string
  deletable?: boolean
  order?: { id: number; orderNo: string; campus?: { name: string }; student: StudentLite; package?: { name: string } | null }
}

export interface Refund {
  id: number
  orderId: number
  amount: number
  currency: string
  method: string | null
  refundedAt: string
  reason: string | null
  operator?: UserLite | null
  order?: { id: number; orderNo: string; campus?: { name: string }; student: StudentLite; package?: { name: string } | null }
}

export interface OrderRow {
  id: number
  orderNo: string
  studentId: number
  student: StudentLite
  campus?: { id: number; name: string }
  sales?: UserLite | null
  package?: { id: number; name: string } | null
  classMode: string
  vipHours: number | null
  vipContent: string | null
  currency: string
  listAmount: number
  discountAmount: number
  discountReason: string | null
  payableAmount: number
  paidAmount: number
  refundedAmount: number
  status: string
  signedAt: string
  expireAt: string | null
  createdAt: string
  note: string | null
}

export interface OrderDetail extends OrderRow {
  items: { id: number; name: string; price: number; quantity: number; productId: number | null }[]
  payments: Payment[]
  refunds: Refund[]
  vipPackages: { id: number; name: string; subject: string | null; totalHours: number; usedHours: number; pendingHours: number; status: string }[]
  access: { canPay: boolean; canRefund: boolean; canEdit: boolean; canCancel: boolean }
}

export interface PaymentInput {
  amount: number | null
  method: string
  kind: string
  paidAt: string | null
  note: string | null
  receiptUrl: string | null
}

export interface OrderInput {
  studentId: number
  packageId: number | null
  classMode: string
  vipHours: number | null
  vipContent: string | null
  extraProductIds: number[]
  currency: string
  discountAmount: number
  discountReason: string | null
  signedAt: string | null
  expireAt: string | null
  note: string | null
  salesId?: number | null
  firstPayment?: PaymentInput | null
}

export type Sums = Record<string, number>

export const ordersApi = {
  products: (params: { type?: 'SINGLE' | 'PACKAGE'; q?: string; active?: boolean; campusId?: number }) => api.get<Product[]>('/orders/products', params),
  createProduct: (body: ProductInput) => api.post<Product>('/orders/products', body),
  updateProduct: (id: number, body: ProductInput) => api.put(`/orders/products/${id}`, body),
  deleteProduct: (id: number) => api.delete(`/orders/products/${id}`),

  list: (params: Record<string, unknown>) =>
    api.get<Paged<OrderRow> & { scope: string; sums: Record<string, { payable: number; paid: number; refunded: number }> }>('/orders', params),
  get: (id: number) => api.get<OrderDetail>(`/orders/${id}`),
  create: (body: OrderInput) => api.post<OrderRow>('/orders', body),
  update: (id: number, body: { note?: string | null; expireAt?: string | null; discountAmount?: number; discountReason?: string | null }) =>
    api.put<OrderRow>(`/orders/${id}`, body),
  cancel: (id: number) => api.post(`/orders/${id}/cancel`),
  pay: (id: number, body: PaymentInput) => api.post(`/orders/${id}/payments`, body),
  deletePayment: (pid: number) => api.delete(`/orders/payments/${pid}`),
  refund: (id: number, body: { amount: number | null; method: string | null; refundedAt: string | null; reason: string | null }) =>
    api.post(`/orders/${id}/refunds`, body),

  payments: (params: Record<string, unknown>) => api.get<Paged<Payment> & { sums: Sums }>('/orders/payments', params),
  refunds: (params: Record<string, unknown>) => api.get<Paged<Refund> & { sums: Sums }>('/orders/refunds', params),
}

/** 把 URL query 里的值清理为接口参数（去空） */
export function cleanParams(o: Record<string, unknown>) {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (v !== '' && v != null && !(Array.isArray(v) && !v.length)) r[k] = v
  return r
}

/** 金额合计文字：{JPY: 1000, CNY: 20} → ¥1,000 / ￥20 */
export function sumsText(sums: Sums | undefined, fmt: (v: number, c: string) => string) {
  const e = Object.entries(sums ?? {})
  return e.length ? e.map(([c, v]) => fmt(v, c)).join(' / ') : fmt(0, 'JPY')
}
