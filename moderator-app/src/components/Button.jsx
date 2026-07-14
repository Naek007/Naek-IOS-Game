import React from 'react';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  style,
  ...props
}) {
  const baseStyle = {
    borderRadius: '12px',
    fontWeight: '600',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  };

  const variants = {
    primary: {
      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
      color: '#fff',
      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.35)',
    },
    secondary: {
      background: 'rgba(255, 255, 255, 0.1)',
      color: '#fff',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    danger: {
      background: 'linear-gradient(135deg, #ff3b30, #c0392b)',
      color: '#fff',
      boxShadow: '0 4px 15px rgba(255, 59, 48, 0.4)',
    },
  };

  const sizes = {
    sm: { padding: '0.5rem 1rem', fontSize: '0.875rem' },
    md: { padding: '0.875rem 1.5rem', fontSize: '1rem' },
    lg: { padding: '1.25rem 2rem', fontSize: '1.25rem' },
  };

  const combinedStyle = {
    ...baseStyle,
    ...variants[variant],
    ...sizes[size],
    ...style, // merge สไตล์ที่ส่งเข้ามา (ไม่ทับสไตล์หลัก)
  };

  return (
    <button style={combinedStyle} className={`btn-custom ${className}`} {...props}>
      {children}
    </button>
  );
}
