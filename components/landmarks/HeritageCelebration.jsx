'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './HeritagePostcard.module.css';

// A small, silent pair of gold blooms. Runs once per browsing session.
export default function HeritageCelebration({ ready, country }) {
  const canvas = useRef(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches || document.visibilityState !== 'visible') return;
    try {
      if (sessionStorage.getItem('heritage-welcome-shown')) return;
      sessionStorage.setItem('heritage-welcome-shown', '1');
    } catch { /* A disabled storage preference does not block the page. */ }
    setActive(true);
  }, [ready]);

  useEffect(() => {
    if (!active || !canvas.current) return;
    const element = canvas.current;
    const context = element.getContext('2d');
    if (!context) return;
    const { width, height } = element.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
    let frame;
    let start;
    let stopped = false;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { stopped = true; cancelAnimationFrame(frame); setActive(false); };
    const onVisibility = () => { if (document.hidden) stop(); };
    const onPreference = () => { if (preference.matches) stop(); };
    const blooms = [{ x: .26, y: .21, delay: 250 }, { x: .73, y: .27, delay: 650 }];
    const draw = time => {
      if (stopped) return;
      start ??= time;
      const elapsed = time - start;
      context.clearRect(0, 0, width, height);
      for (const bloom of blooms) {
        const progress = (elapsed - bloom.delay) / 1100;
        if (progress <= 0 || progress >= 1) continue;
        const travel = (1 - Math.pow(1 - progress, 3)) * Math.min(width * .16, 90);
        context.globalAlpha = Math.sin(progress * Math.PI) * .65;
        for (let i = 0; i < 24; i++) {
          const angle = i * Math.PI / 12;
          const radius = travel * (i % 2 ? .72 : 1);
          const x = width * bloom.x + Math.cos(angle) * radius;
          const y = height * bloom.y + Math.sin(angle) * radius + progress * progress * 15;
          context.strokeStyle = country === 'Bahrain' ? (i % 3 ? '#fff8ed' : '#e6939d') : (i % 3 ? '#e9c878' : '#fff2cf');
          context.lineWidth = 1.25;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x - Math.cos(angle) * 3, y - Math.sin(angle) * 3);
          context.stroke();
        }
      }
      if (elapsed > 1850) stop(); else frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', onVisibility);
    preference.addEventListener('change', onPreference);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      preference.removeEventListener('change', onPreference);
    };
  }, [active, country]);
  return active ? <canvas ref={canvas} className={styles.celebration} aria-hidden="true" /> : null;
}
