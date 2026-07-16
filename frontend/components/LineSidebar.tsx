"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import './LineSidebar.css';

const FALLOFF_CURVES: Record<string, (p: number) => number> = {
  linear: p => p,
  smooth: p => p * p * (3 - 2 * p),
  sharp: p => p * p * p
};

interface LineSidebarProps {
  items: string[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: 'linear' | 'smooth' | 'sharp';
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  defaultActive?: number | null;
  onItemClick?: (index: number, label: string) => void;
  onRenameItem?: (index: number, newTitle: string) => Promise<void> | void;
  onDeleteItem?: (index: number) => Promise<void> | void;
  className?: string;
}

const LineSidebar: React.FC<LineSidebarProps> = ({
  items,
  accentColor = '#3b82f6',
  textColor = '#9ca3af',
  markerColor = 'rgba(255, 255, 255, 0.08)',
  showIndex = true,
  showMarker = true,
  proximityRadius = 100,
  maxShift = 12,
  falloff = 'smooth',
  markerLength = 24,
  markerGap = 8,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 12,
  fontSize = 0.88,
  smoothing = 100,
  defaultActive = null,
  onItemClick,
  onRenameItem,
  onDeleteItem,
  className = ''
}) => {
  const listRef = useRef<HTMLUListElement | null>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const targetsRef = useRef<number[]>([]);
  const currentRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const activeRef = useRef<number | null>(defaultActive);
  const smoothingRef = useRef<number>(smoothing);
  const [activeIndex, setActiveIndex] = useState<number | null>(defaultActive);

  // States for renaming feature
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  activeRef.current = activeIndex;
  smoothingRef.current = smoothing;

  // Sync state if defaultActive changes dynamically
  useEffect(() => {
    setActiveIndex(defaultActive);
  }, [defaultActive]);

  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const tau = Math.max(smoothingRef.current, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);

    let moving = false;
    const elements = itemRefs.current;
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el) continue;
      const target = Math.max(targetsRef.current[i] || 0, activeRef.current === i ? 1 : 0);
      const cur = currentRef.current[i] || 0;
      const next = cur + (target - cur) * k;
      const settled = Math.abs(target - next) < 0.0015;
      const value = settled ? target : next;
      currentRef.current[i] = value;
      el.style.setProperty('--effect', value.toFixed(4));
      if (!settled) moving = true;
    }

    rafRef.current = moving ? requestAnimationFrame(runFrame) : null;
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      const list = listRef.current;
      if (!list) return;
      const rect = list.getBoundingClientRect();
      const pointerY = e.clientY - rect.top;
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
      const elements = itemRefs.current;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el) continue;
        const center = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(pointerY - center);
        targetsRef.current[i] = ease(Math.max(0, 1 - distance / proximityRadius));
      }
      startLoop();
    },
    [falloff, proximityRadius, startLoop]
  );

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0);
    startLoop();
  }, [startLoop]);

  const handleClick = useCallback(
    (index: number, label: string) => {
      // Don't trigger navigation if currently editing this item
      if (editingIndex === index) return;
      setActiveIndex(index);
      onItemClick?.(index, label);
    },
    [onItemClick, editingIndex]
  );

  const handleStartEdit = (index: number, label: string) => {
    setEditingIndex(index);
    setEditValue(label);
  };

  const handleSave = async (index: number) => {
    const val = editValue.trim();
    if (val && onRenameItem) {
      await onRenameItem(index, val);
    }
    setEditingIndex(null);
  };

  useEffect(() => {
    startLoop();
  }, [activeIndex, startLoop]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return (
    <nav
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${scaleTick ? ' line-sidebar--scale-tick' : ''}${className ? ` ${className}` : ''}`}
      style={{
        // @ts-ignore custom CSS variables properties
        '--accent-color': accentColor,
        '--text-color': textColor,
        '--marker-color': markerColor,
        '--marker-length': `${markerLength}px`,
        '--marker-gap': `${markerGap}px`,
        '--tick-scale': tickScale,
        '--max-shift': `${maxShift}px`,
        '--item-gap': `${itemGap}px`,
        '--font-size': `${fontSize}rem`,
        '--smoothing': `${smoothing}ms`
      }}
    >
      <ul ref={listRef} className="line-sidebar__list" onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
        {items.map((label, index) => {
          const isEditing = editingIndex === index;
          return (
            <li
              key={`${label}-${index}`}
              ref={el => {
                itemRefs.current[index] = el;
              }}
              className={`line-sidebar__item ${isEditing ? 'line-sidebar__item--editing' : ''}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => handleClick(index, label)}
              style={isEditing ? { '--max-shift': '0px' } as React.CSSProperties : undefined}
            >
              {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
              
              {isEditing ? (
                <span className="line-sidebar__label">
                  <input
                    type="text"
                    className="line-sidebar__input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleSave(index);
                      } else if (e.key === 'Escape') {
                        setEditingIndex(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="line-sidebar__edit-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="line-sidebar__action-btn line-sidebar__action-btn--success"
                      onClick={() => void handleSave(index)}
                      title="Save"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="line-sidebar__action-btn line-sidebar__action-btn--cancel"
                      onClick={() => setEditingIndex(null)}
                      title="Cancel"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                </span>
              ) : (
                <span className="line-sidebar__label">
                  <span className="line-sidebar__left">
                    {showIndex && <span className="line-sidebar__index">{String(index + 1).padStart(2, '0')}</span>}
                    <span className="line-sidebar__text">{label}</span>
                  </span>
                  {(onRenameItem || onDeleteItem) && (
                    <span className="line-sidebar__actions" onClick={(e) => e.stopPropagation()}>
                      {onRenameItem && (
                        <button
                          type="button"
                          className="line-sidebar__action-btn line-sidebar__action-btn--edit"
                          onClick={() => handleStartEdit(index, label)}
                          title="Rename"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      )}
                      {onDeleteItem && (
                        <button
                          type="button"
                          className="line-sidebar__action-btn line-sidebar__action-btn--danger"
                          onClick={() => void onDeleteItem(index)}
                          title="Delete"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default LineSidebar;
