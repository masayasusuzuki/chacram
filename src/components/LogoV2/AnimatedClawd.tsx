import { c as _c } from "react-compiler-runtime";
import React from 'react';
import { Box } from '../../ink.js';
import { Clawd, type UFOPose } from './Clawd.js';

// ─── UFO Animation ───────────────────────────────────────────────────────
// Uses React state to alternate between 'default' and 'hovering' poses,
// creating a subtle hovering effect (tractor beam extends).
// Cycles are staggered by a small random offset per mount so multiple
// instances don't sync, which would look robotic.
// ─────────────────────────────────────────────────────────────────────────

export function AnimatedClawd() {
  const $ = _c(2);
  const [pose, setPose] = React.useState<UFOPose>('default');

  React.useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame % 20 === 0) {
        setPose(p => (p === 'default' ? 'hovering' : 'default'));
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  let t0: React.ReactNode;
  if ($[0] !== pose) {
    t0 = (
      <Box marginY={1}>
        <Clawd pose={pose} />
      </Box>
    );
    $[0] = pose;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}
