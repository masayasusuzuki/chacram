import { c as _c } from "react-compiler-runtime";
import React from 'react';
import { Box } from '../../ink.js';
import { Clawd } from './Clawd.js';

// Block text logo is static — no animation needed.
// Wrapper preserved for API compatibility with LogoV2.

export function AnimatedClawd() {
  const $ = _c(1);
  let t0: React.ReactNode;
  if ($[0] !== true) {
    t0 = (
      <Box marginY={1}>
        <Clawd />
      </Box>
    );
    $[0] = true;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  return t0;
}
