export interface AvatarConfig {
  skinColor: string
  bodyType: 'normal' | 'round' | 'slim'
  earStyle: 'round' | 'pointed' | 'big' | 'none'
  eyeStyle: 'round' | 'oval' | 'big' | 'small' | 'sleepy'
  eyebrowStyle: 'normal' | 'thick' | 'thin' | 'arched' | 'none'
  noseStyle: 'small' | 'medium' | 'big' | 'pointed'
  mouthStyle: 'smile' | 'neutral' | 'open' | 'smirk'
  hairStyle: 'short' | 'long' | 'curly' | 'mohawk' | 'ponytail' | 'bun' | 'bald'
  hairColor: string
  clothesStyle: 'tshirt' | 'suit' | 'dress' | 'hoodie' | 'tank'
  clothesColor: string
  accessory: 'none' | 'glasses' | 'hat' | 'earring' | 'necklace' | 'headband'
}

export const DEFAULT_AVATAR: AvatarConfig = {
  skinColor: '#C68642',
  bodyType: 'normal',
  earStyle: 'round',
  eyeStyle: 'round',
  eyebrowStyle: 'normal',
  noseStyle: 'small',
  mouthStyle: 'smile',
  hairStyle: 'short',
  hairColor: '#2C1810',
  clothesStyle: 'tshirt',
  clothesColor: '#4361ee',
  accessory: 'none',
}

export const SKIN_COLORS = [
  '#FDEBD0', '#F5CBA7', '#F0B27A', '#E5A57B', '#D4956B',
  '#C68642', '#A0522D', '#8B4513', '#654321', '#3E2723',
  '#FAD7A0', '#D2B48C', '#BC8F3F', '#4E342E',
]

export const HAIR_COLORS = [
  '#2C1810', '#1A1110', '#4A3728', '#8B6914',
  '#D4A76A', '#C62828', '#E65100', '#F9A825',
  '#9E9E9E', '#FAFAFA', '#1565C0', '#6A1B9A',
]

export const CLOTHES_COLORS = [
  '#4361ee', '#E53935', '#43A047', '#FB8C00',
  '#8E24AA', '#00ACC1', '#F06292', '#FFD54F',
  '#3E2723', '#37474F', '#FAFAFA', '#212121',
]

export type OptionDef<T extends string> = { value: T; label: string; emoji?: string }

export const BODY_TYPES: OptionDef<AvatarConfig['bodyType']>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'round', label: 'Redondo' },
  { value: 'slim', label: 'Slim' },
]

export const EAR_STYLES: OptionDef<AvatarConfig['earStyle']>[] = [
  { value: 'round', label: 'Redonda', emoji: '🦱' },
  { value: 'pointed', label: 'Pontuda', emoji: '🧝' },
  { value: 'big', label: 'Grande', emoji: '🐘' },
  { value: 'none', label: 'Sem', emoji: '—' },
]

export const EYE_STYLES: OptionDef<AvatarConfig['eyeStyle']>[] = [
  { value: 'round', label: 'Redondo', emoji: '👁️' },
  { value: 'oval', label: 'Oval', emoji: '👀' },
  { value: 'big', label: 'Grande', emoji: '🥺' },
  { value: 'small', label: 'Pequeno', emoji: '😑' },
  { value: 'sleepy', label: 'Sonolento', emoji: '😴' },
]

export const EYEBROW_STYLES: OptionDef<AvatarConfig['eyebrowStyle']>[] = [
  { value: 'normal', label: 'Normal', emoji: '😐' },
  { value: 'thick', label: 'Grosso', emoji: '🤨' },
  { value: 'thin', label: 'Fino', emoji: '🧐' },
  { value: 'arched', label: 'Arqueado', emoji: '😏' },
  { value: 'none', label: 'Sem', emoji: '—' },
]

export const NOSE_STYLES: OptionDef<AvatarConfig['noseStyle']>[] = [
  { value: 'small', label: 'Pequeno', emoji: '·' },
  { value: 'medium', label: 'Médio', emoji: '👃' },
  { value: 'big', label: 'Grande', emoji: '🫃' },
  { value: 'pointed', label: 'Pontudo', emoji: '🔺' },
]

export const MOUTH_STYLES: OptionDef<AvatarConfig['mouthStyle']>[] = [
  { value: 'smile', label: 'Sorriso', emoji: '😊' },
  { value: 'neutral', label: 'Neutro', emoji: '😐' },
  { value: 'open', label: 'Aberto', emoji: '😮' },
  { value: 'smirk', label: 'Sorriso Leve', emoji: '😏' },
]

export const HAIR_STYLES: OptionDef<AvatarConfig['hairStyle']>[] = [
  { value: 'short', label: 'Curto', emoji: '💇' },
  { value: 'long', label: 'Longo', emoji: '💇‍♀️' },
  { value: 'curly', label: 'Cacheado', emoji: '🦱' },
  { value: 'mohawk', label: 'Moicano', emoji: '🤘' },
  { value: 'ponytail', label: 'Rabo de Cavalo', emoji: '🐴' },
  { value: 'bun', label: 'Coque', emoji: '🧑‍🦰' },
  { value: 'bald', label: 'Careca', emoji: '🧑‍🦲' },
]

export const CLOTHES_STYLES: OptionDef<AvatarConfig['clothesStyle']>[] = [
  { value: 'tshirt', label: 'Camiseta', emoji: '👕' },
  { value: 'suit', label: 'Terno', emoji: '🤵' },
  { value: 'dress', label: 'Vestido', emoji: '👗' },
  { value: 'hoodie', label: 'Moletom', emoji: '🧥' },
  { value: 'tank', label: 'Regata', emoji: '🎽' },
]

export const ACCESSORY_STYLES: OptionDef<AvatarConfig['accessory']>[] = [
  { value: 'none', label: 'Nenhum', emoji: '—' },
  { value: 'glasses', label: 'Óculos', emoji: '👓' },
  { value: 'hat', label: 'Chapéu', emoji: '🎩' },
  { value: 'earring', label: 'Brinco', emoji: '💎' },
  { value: 'necklace', label: 'Colar', emoji: '📿' },
  { value: 'headband', label: 'Tiara', emoji: '👑' },
]
