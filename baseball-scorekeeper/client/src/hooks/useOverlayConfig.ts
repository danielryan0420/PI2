import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface OverlayConfig {
  transparent: boolean;
  compact: boolean;
  theme: string | null;
  scale: number;
  hidden: Set<string>;
}

/**
 * Parses OBS-overlay query params for the public scoreboard page:
 *  ?transparent=1   - transparent page background (for OBS browser sources)
 *  ?compact=1       - minimal single-line ticker layout
 *  ?theme=dark|light|<name> - color theme
 *  ?scale=1.5       - CSS transform scale
 *  ?hide=diamond,pitcher - comma list of sections to omit
 */
export function useOverlayConfig(): OverlayConfig {
  const [params] = useSearchParams();

  const config = useMemo<OverlayConfig>(() => {
    const transparent = params.get('transparent') === '1';
    const compact = params.get('compact') === '1';
    const theme = params.get('theme');
    const scale = parseFloat(params.get('scale') || '1') || 1;
    const hidden = new Set((params.get('hide') || '').split(',').map((s) => s.trim()).filter(Boolean));
    return { transparent, compact, theme, scale, hidden };
  }, [params]);

  useEffect(() => {
    document.body.classList.toggle('overlay-transparent', config.transparent);
    return () => document.body.classList.remove('overlay-transparent');
  }, [config.transparent]);

  return config;
}
