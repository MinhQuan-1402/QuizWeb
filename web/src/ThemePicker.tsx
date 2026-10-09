import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
const choices: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Sáng', icon: '☀' },
  { value: 'dark', label: 'Tối', icon: '☾' },
  { value: 'system', label: 'Hệ thống', icon: '◐' },
];

export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('quizweb-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch { return 'system'; }
  });
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    try { localStorage.setItem('quizweb-theme', theme); } catch { /* Keep working when storage is unavailable. */ }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return <div className="theme-picker" role="group" aria-label="Giao diện sáng tối">
    {choices.map(choice => <button key={choice.value} type="button" aria-pressed={theme === choice.value}
      title={`Giao diện ${choice.label.toLowerCase()}`} onClick={() => setTheme(choice.value)}>
      <span aria-hidden="true">{choice.icon}</span><span>{choice.label}</span>
    </button>)}
  </div>;
}
