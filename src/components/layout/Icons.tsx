const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const wrap = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" {...base} aria-hidden="true">{children}</svg>
);

export const Icons = {
  home: () => wrap(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M9.5 20v-5.5h5V20" /></>),
  folder: () => wrap(<><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M3 11h18" /></>),
  target: () => wrap(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>),
  chat: () => wrap(<><path d="M4 5h16v11H9l-5 4Z" /><path d="M8 9.5h8" /><path d="M8 12.5h5" /></>),
  run: () => wrap(<><circle cx="14.5" cy="4.8" r="1.9" /><path d="M8 21l3-5-2.5-3 1-5 3.5 2 2.5 2.5 3 .6" /><path d="M9.5 10 6 11.5" /><path d="M13 13.5 15 21" /></>),
  wallet: () => wrap(<><path d="M4 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" /><path d="M15 12.5h4.5" /><circle cx="15.5" cy="12.5" r=".6" fill="currentColor" /></>),
  compass: () => wrap(<><circle cx="12" cy="12" r="8.5" /><path d="m15 9-1.8 4.2L9 15l1.8-4.2Z" /></>),
  gear: () => wrap(<><path d="M4 7h6M14 7h6M4 12h11M19 12h1M4 17h3M11 17h9" /><circle cx="12" cy="7" r="2" /><circle cx="17" cy="12" r="2" /><circle cx="9" cy="17" r="2" /></>),
  flame: () => wrap(<><path d="M12 3s4.5 3.6 4.5 8a4.5 4.5 0 0 1-9 0c0-1.4.6-2.6 1.3-3.5.2 1.4 1 2.2 1.9 2.2 1 0 1.5-.9 1.3-2.3-.2-1.7-.5-3-.5-4.4Z" /><path d="M7 13.5A5 5 0 0 0 12 21a5 5 0 0 0 5-5" /></>),
  repeat: () => wrap(<><path d="M4 9.5A3.5 3.5 0 0 1 7.5 6H18" /><path d="m15.5 3.5 3 2.5-3 2.5" /><path d="M20 14.5a3.5 3.5 0 0 1-3.5 3.5H6" /><path d="m8.5 20.5-3-2.5 3-2.5" /></>),
  flag: () => wrap(<><path d="M6 21V4" /><path d="M6 5h11l-2 3.5L17 12H6" /></>),
  note: () => wrap(<><path d="M6 3.5h9l3.5 3.5v13.5H6Z" /><path d="M14.5 3.5V7.5H18.5" /><path d="M9 12h6M9 15.5h4" /></>),
  grid: () => wrap(<><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>),
  back: () => wrap(<><path d="M15 5.5 8.5 12l6.5 6.5" /></>),
  plus: () => wrap(<><path d="M12 5.5v13M5.5 12h13" /></>),
};
