import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'gaming' | 'hover';
}

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  const baseStyles = 'rounded-xl shadow-lg backdrop-blur-sm';
  
  const variantStyles = {
    default: 'bg-[var(--bg-card)] border border-[var(--border-primary)]',
    gaming: 'card-gaming',
    hover: 'bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--accent-blue)] transition-colors'
  };

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
      {children}
    </div>
  );
} 