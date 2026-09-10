import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react';
import { ChevronRight, Star } from 'lucide-react';
import { formatDate, photos } from '../data';
import type { Memory } from '../data';

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  function IconButton({ label, className = '', children, ...props }, ref) {
    return <button ref={ref} type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
  },
);

export function Photo({ alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img alt={alt ?? ''} decoding="async" {...props} onError={(event) => {
    if (event.currentTarget.getAttribute('src') !== photos.meal) event.currentTarget.src = photos.meal;
  }} />;
}

export function ScreenHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <header className="screen-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</header>;
}

export function MemoryRow({ memory, onClick }: { memory: Memory; onClick: () => void }) {
  return <button className="memory-row" onClick={onClick}>
    <Photo className="memory-row-photo" src={memory.placePhoto ?? memory.photo} alt={`${memory.restaurant} memory`} />
    <span className="memory-row-copy"><strong>{memory.restaurant}</strong><span>{formatDate(memory.date)}</span><span>{memory.neighborhood ? `${memory.neighborhood}, ` : ''}{memory.city}</span></span>
    <ChevronRight size={14} strokeWidth={1.35} />
  </button>;
}

export function Rating({ value, onChange }: { value: number; onChange?: (rating: number) => void }) {
  return <div className={`rating ${onChange ? 'rating-input' : ''}`} role={onChange ? 'group' : 'img'} aria-label={`Rating: ${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((star) => onChange
      ? <button type="button" key={star} aria-label={`Rate ${star} ${star === 1 ? 'star' : 'stars'}`} aria-pressed={value === star} onClick={() => onChange(star)}><Star size={15} strokeWidth={1.1} fill={star <= value ? 'currentColor' : 'none'} className={star > value ? 'unfilled-star' : ''} /></button>
      : <Star key={star} size={14} strokeWidth={1.1} fill={star <= value ? 'currentColor' : 'none'} className={star > value ? 'unfilled-star' : ''} />)}
  </div>;
}

export function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button type="button" className="toggle-row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
    <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <span className={`toggle-track ${checked ? 'is-on' : ''}`}><span /></span>
  </button>;
}

export function Stat({ value, label }: { value: string | number; label: string }) {
  return <span className="stat"><strong>{value}</strong><span>{label}</span></span>;
}