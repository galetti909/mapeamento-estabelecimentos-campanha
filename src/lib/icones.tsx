import {
  Beer, Bus, Coffee, Croissant, LandPlot, MapPin, ShoppingCart, Store, Tent, TreePine, UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { TipoLocal } from './tipos';

/** Ícone de cada tipo de local, usado na ficha e nos filtros. */
export const ICONE_DO_TIPO: Record<TipoLocal, LucideIcon> = {
  feira: Tent,
  praca: LandPlot,
  parque: TreePine,
  mercado: ShoppingCart,
  padaria: Croissant,
  bar: Beer,
  cafe: Coffee,
  restaurante: UtensilsCrossed,
  comercio: Store,
  terminal: Bus,
  outro: MapPin,
};
