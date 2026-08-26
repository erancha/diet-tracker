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
  alarm: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
           <path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  openDay: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
             <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof GLYPHS;

// Decorative by contract: every call site is a control that already carries its own accessible
// name, so the glyph is hidden from assistive technology rather than doubling that name.
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {GLYPHS[name]}
    </svg>
  );
}
