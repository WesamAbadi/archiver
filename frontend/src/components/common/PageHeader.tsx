import React from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}

export function PageHeader({ icon: Icon, title, description, className = '' }: PageHeaderProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-purple)]/10 via-[var(--accent-blue)]/5 to-transparent"></div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-[var(--accent-purple)]/10 rounded-xl">
            <Icon className="w-8 h-8 text-[var(--accent-purple)]" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)] bg-clip-text text-transparent">
            {title}
          </h1>
        </div>
        {description && (
          <p className="text-xl text-[var(--text-secondary)] max-w-3xl">
            {description}
          </p>
        )}
      </div>
    </div>
  );
} 