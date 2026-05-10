#!/usr/bin/env bun
/**
 * Render the CHACRAM UFO logo in terminal using Ink
 * Run: bun scripts/render-logo.tsx
 */
import React from "react";
import { render, Box } from "../node_modules/ink/build/index.js";
import { Clawd } from "../src/components/LogoV2/Clawd.tsx";

const { unmount } = render(
  React.createElement(
    Box,
    { flexDirection: "column", padding: 1 },
    React.createElement(
      Box,
      { marginY: 1 },
      React.createElement(Clawd, {})
    ),
    // Empty box to push content
    React.createElement(Box, {})
  )
);

// Auto-exit after 2 seconds
setTimeout(() => {
  unmount();
  process.exit(0);
}, 2000);
