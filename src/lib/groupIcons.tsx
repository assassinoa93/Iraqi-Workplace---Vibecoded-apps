import React from 'react';
import {
  Boxes, ShoppingCart, Coffee, Utensils, Truck, Car, Building2, Wrench, Cpu, Phone,
  Monitor, Lock, Heart, Headphones, Briefcase, Activity, Users, Package, Zap, Store,
} from 'lucide-react';

// v2.2.0 — curated icon palette for station groups. Keyed by short
// stable names (saved on `StationGroup.icon`) so renaming icon
// components or upgrading lucide-react doesn't invalidate user data.
// Add new icons by appending to this map; the picker UI iterates the
// keys in declaration order.
export const GROUP_ICON_PALETTE: Record<string, React.ComponentType<{ className?: string }>> = {
  boxes: Boxes,
  store: Store,
  cart: ShoppingCart,
  coffee: Coffee,
  utensils: Utensils,
  truck: Truck,
  car: Car,
  building: Building2,
  wrench: Wrench,
  cpu: Cpu,
  phone: Phone,
  monitor: Monitor,
  lock: Lock,
  heart: Heart,
  headphones: Headphones,
  briefcase: Briefcase,
  activity: Activity,
  users: Users,
  package: Package,
  zap: Zap,
};

export const DEFAULT_GROUP_ICON = 'boxes';

// Resolve a group icon name to its component. Falls back to the default
// when the key is missing (pre-2.2.0 groups) or no longer in the palette.
export function getGroupIcon(name: string | undefined): React.ComponentType<{ className?: string }> {
  if (!name) return GROUP_ICON_PALETTE[DEFAULT_GROUP_ICON];
  return GROUP_ICON_PALETTE[name] || GROUP_ICON_PALETTE[DEFAULT_GROUP_ICON];
}
