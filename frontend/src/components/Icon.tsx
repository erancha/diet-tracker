import type { ReactElement } from "react";

// The app's icon set. Each glyph binds its stroke to currentColor, so it takes on the palette of
// the control holding it — including the hover, focus and disabled states the button rule paints.
// The geometry ships with the app rather than resolving through a system font, so a control's
// meaning does not vary with the platform rendering it.
//
// Outline geometry on a 24-unit viewBox, so the paths stay resolution-independent at whatever size
// style.css gives them.
const GLYPHS = {
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  remove: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  alarm: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
           <path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  openDay: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
             <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  menu: <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>,
  foldAll: <><path d="m7 20 5-5 5 5" /><path d="m7 4 5 5 5-5" /></>,
  unfoldAll: <><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></>,
  alarmOff: <><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" />
              <path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><path d="m2 2 20 20" /></>,
  signOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" />
             <path d="M21 12H9" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" />
           <circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98" />
           <path d="m15.41 6.51-6.82 3.98" /></>,
  spark: <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2Z" />,
  trend: <><path d="M4 3v16a2 2 0 0 0 2 2h15" /><path d="m7 15 4-5 3 3 6-7" /></>,
  trendDown: <path d="M4 8 20 16" />,
  trendFlat: <path d="M4 12h16" />,
  trendUp: <path d="M4 16 20 8" />,
  trendPeak: <path d="M4 16 12 8 20 16" />,
  trendValley: <path d="M4 8 12 16 20 8" />,
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof GLYPHS;

// Decorative by contract: the glyph is hidden from assistive technology, so naming it is the call
// site's job — a control names itself, and a marker standing on its own is wrapped in an element
// that names it.
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {GLYPHS[name]}
    </svg>
  );
}
