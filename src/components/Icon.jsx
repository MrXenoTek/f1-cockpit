// Inline stroke icons — inherit currentColor.
const P = {
  chevron: <path d="M4 6l4 4 4-4" />,
  prev: <path d="M10 3.5 5.5 8l4.5 4.5" />,
  next: <path d="M6 3.5 10.5 8 6 12.5" />,
  link: <path d="M6.5 9.5 9.5 6.5M7 4.5l1.2-1.2a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8" />,
  expand: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  swap: <path d="M2 5h9M8.5 2.5 11 5 8.5 7.5M14 11H5M7.5 8.5 5 11l2.5 2.5" />,
  timer: <><circle cx="8" cy="9" r="5.2" /><path d="M8 9V6.5M6.3 2h3.4" /></>,
  tyre: <><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.2" /></>,
  chat: <path d="M2.5 3.5h11v7H7l-3 2.8v-2.8H2.5z" />,
  cloud: <path d="M4.5 12.5a3.2 3.2 0 1 1 .5-6.3A4 4 0 0 1 12.6 7a2.6 2.6 0 0 1-.4 5.5z" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  flag: <path d="M3.5 14V2.5M3.5 3h8l-1.8 2.7 1.8 2.8h-8" />,
  pencil: <path d="M10.5 2.5l3 3L6 13H3v-3z" />,
  download: <path d="M8 2.5v7.5M5 7l3 3 3-3M3 13h10" />,
};

export default function Icon({ name, size = 16, sw = 1.6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {P[name]}
    </svg>
  );
}

export const PlayIcon = ({ playing, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
    {playing
      ? <><rect x="4" y="3" width="3.6" height="12" rx="1" /><rect x="10.4" y="3" width="3.6" height="12" rx="1" /></>
      : <path d="M5 3.2v11.6c0 .6.7 1 1.2.6l8.4-5.8a.7.7 0 0 0 0-1.2L6.2 2.6c-.5-.4-1.2 0-1.2.6z" />}
  </svg>
);
