import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card } from './ui/Card';

interface ShareTarget {
  label: string;
  description: string;
  path: string;
}

function buildTargets(gameId: number | string): ShareTarget[] {
  return [
    {
      label: 'Scoreboard (full screen)',
      description: 'Open on a TV, tablet, or laptop, or share with viewers.',
      path: `/scoreboard/${gameId}`,
    },
    {
      label: 'OBS / streaming overlay',
      description: 'Add as a Browser Source in OBS or a streaming app that supports a web overlay. Transparent background.',
      path: `/scoreboard/${gameId}?transparent=1`,
    },
    {
      label: 'Scorekeeper (enter plays)',
      description: 'Open on the phone the scorekeeper will use during the game.',
      path: `/score/${gameId}`,
    },
  ];
}

function LinkRow({ target }: { target: ShareTarget }) {
  const [copied, setCopied] = useState(false);
  // window.location.origin is the host this page was loaded from, so any
  // device on the same network (e.g. the same phone hotspot) that scans the
  // QR code or opens the link reaches the server without typing an IP.
  const url = `${window.location.origin}${target.path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable on insecure origins; QR/link still work */
    }
  };

  return (
    <div className="flex gap-3 items-start py-3 border-t first:border-t-0">
      <div className="bg-white p-1 rounded shrink-0">
        <QRCodeSVG value={url} size={88} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm">{target.label}</div>
        <p className="text-xs text-gray-500 mb-1">{target.description}</p>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-gray-100 rounded px-1.5 py-0.5 truncate block flex-1">{url}</code>
          <button
            onClick={copy}
            className="text-xs text-blue-600 hover:underline shrink-0 min-h-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 hover:underline"
        >
          Open
        </a>
      </div>
    </div>
  );
}

export function ShareLinks({ gameId }: { gameId: number | string }) {
  const targets = buildTargets(gameId);
  return (
    <Card>
      <h2 className="font-semibold mb-1">Share &amp; stream</h2>
      <p className="text-xs text-gray-500 mb-2">
        Scan a QR code from another device on the same Wi-Fi (or phone hotspot) to open it
        instantly &mdash; no IP address to type.
      </p>
      <div>
        {targets.map((t) => (
          <LinkRow key={t.path} target={t} />
        ))}
      </div>
    </Card>
  );
}
