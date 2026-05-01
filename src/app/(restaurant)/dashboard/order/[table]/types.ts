export interface DbCategory {
  id: string
  name: string
  color: string
}

export interface DbMenuItem {
  id: string
  name: string
  price: number
  category_id: string | null
  image_url?: string | null
}

export interface KitchenNote {
  id: string
  text: string
}

export interface SelectedOption {
  modifier_id: string
  modifier_name: string
  option_id: string
  option_name: string
  price: number
}

export interface DraftEntry {
  qty: number
  selectedNoteIds: string[]
  customNote: string
  selectedOptions: SelectedOption[]
}

export interface ModifierGroup {
  id: string
  name: string
  required: boolean
  min_select: number
  max_select: number
  options: { id: string; name: string; price: number }[]
}

export interface DbOrderItem {
  id: string
  item_name: string
  item_price: number
  qty: number
  status: 'pending' | 'sent' | 'cooking' | 'ready' | 'void'
  note?: string | null
}
