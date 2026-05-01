export interface Item {
  name:  string
  price: number
  qty:   number
}

export interface ReceiptSettings {
  shop_name:       string | null
  logo_url:        string | null
  phone:           string | null
  address:         string | null
  thank_you_msg:   string | null
  currency_symbol: string
  show_qr:         boolean
  qr_url:          string | null
  show_logo:       boolean
  show_address:    boolean
  show_phone:      boolean
}

export const DEFAULT_RS: ReceiptSettings = {
  shop_name:       null,
  logo_url:        null,
  phone:           null,
  address:         null,
  thank_you_msg:   'Thank you for your visit!',
  currency_symbol: '$',
  show_qr:         true,
  qr_url:          null,
  show_logo:       true,
  show_address:    true,
  show_phone:      true,
}

export interface InvoiceModalProps {
  mode:            'receipt' | 'payment'
  orderId:         string
  restaurantId:    string
  tableNum:        string
  guests:          number
  items:           Item[]
  subtotal:        number
  discount:        number
  surcharge:       number
  total:           number
  paymentMethod:   string
  amountPaid:      number
  changeAmount:    number
  cashier:         string
  note?:           string
  customerId?:     string | null
  customerName?:   string | null
  customerPhone?:  string | null
  invoiceNum?:     string
  orderNum?:       string
  autoPrint?:      boolean
  onClose:         () => void
}
