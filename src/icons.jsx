// icons.jsx — Lucide React icon wrapper
import {
  Home, Search, Plus, MessageSquare, User, Heart, ChevronLeft, ChevronRight,
  ChevronDown, X, Sparkles, ShieldCheck, ArrowLeftRight, Link2, Wallet,
  Check, CheckCircle, Lock, Clock, Star, Map, SlidersHorizontal, Bell,
  Camera, ArrowRight, Send, PlusCircle, Flame, Eye, EyeOff, Tag, Gift, Info, Mail, Bot, Pencil, Settings,
} from 'lucide-react';

const MAP = {
  home:        Home,
  search:      Search,
  plus:        Plus,
  chat:        MessageSquare,
  user:        User,
  heart:       Heart,
  back:        ChevronLeft,
  chevR:       ChevronRight,
  chevD:       ChevronDown,
  close:       X,
  spark:       Sparkles,
  sparkLine:   Sparkles,
  shield:      ShieldCheck,
  swap:        ArrowLeftRight,
  chain:       Link2,
  wallet:      Wallet,
  check:       Check,
  checkCircle: CheckCircle,
  lock:        Lock,
  clock:       Clock,
  star:        Star,
  map:         Map,
  filter:      SlidersHorizontal,
  bell:        Bell,
  camera:      Camera,
  arrowR:      ArrowRight,
  send:        Send,
  plusCircle:  PlusCircle,
  flame:       Flame,
  eye:         Eye,
  eyeOff:      EyeOff,
  tag:         Tag,
  gift:        Gift,
  info:        Info,
  mail:        Mail,
  ai:          Bot,
  edit:        Pencil,
  settings:    Settings,
};

export function Icon({ name, size = 22, sw = 1.9, color = 'currentColor', fill = 'none', style }) {
  const Comp = MAP[name];
  if (!Comp) return null;
  return (
    <Comp
      size={size}
      strokeWidth={sw}
      color={color}
      fill={fill}
      style={{ display: 'block', flex: 'none', ...style }}
    />
  );
}
