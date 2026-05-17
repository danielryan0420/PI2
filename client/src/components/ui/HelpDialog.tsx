import React, { useState } from 'react';
import { Dialog } from './Dialog';

export interface HelpSection {
  title: string;
  bullets: string[];
}

interface Props {
  title: string;
  sections: HelpSection[];
}

export function HelpButton({ title, sections }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="no-min-h w-7 h-7 rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 text-sm font-bold flex items-center justify-center transition-colors"
        title="Help"
        aria-label="Help"
      >
        ?
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} className="max-w-lg">
        <div className="flex flex-col gap-4 pb-2">
          {sections.map((s) => (
            <div key={s.title}>
              <h4 className="text-sm font-semibold text-gray-800 mb-1">{s.title}</h4>
              <ul className="flex flex-col gap-1">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-blue-400 mt-0.5 shrink-0">›</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}
