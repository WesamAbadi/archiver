import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'gradient';
}

export function PageContainer({ children, className = '', variant = 'default' }: PageContainerProps) {
  const baseStyles = 'min-h-screen';
  
  const variantStyles = {
    default: 'bg-[var(--bg-primary)]',
    gradient: 'bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900'
  };

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(255,255,255,0))]"></div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
} 