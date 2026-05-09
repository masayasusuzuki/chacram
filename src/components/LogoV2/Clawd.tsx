import { c as _c } from "react-compiler-runtime";
import * as React from 'react';
import { Box, Text } from '../../ink.js';
import { env } from '../../utils/env.js';

export type UFOPose = 'default' | 'hovering';

// ─── UFO ASCII Art (7 rows) ──────────────────────────────────────────────
// Rendered with Ink <Text> components, each segment gets its own color.
//
//       ╭───────────╮            ← dome top (text)
//      ╱╭─── ◉◉ ───╮╲           ← dome with alien eyes (warning)
//     ▕▕  CHACRAM   ▏▏          ← body (text + bold white name)
//      ╲╰── ▐▓▓▓▌ ──╯╱          ← engine lights (warning, orange glow)
//       ╰──────┬──────╯          ← saucer bottom (text)
//        ╲    ░░░    ╱           ← tractor beam (cyan bright, gradient width)
//         ╲  ░░░░  ╱
//          ╲ ░░░░ ╱
//           ╲░░░░╱
// ─────────────────────────────────────────────────────────────────────────

const UFO = {
  default: {
    r0: '      ╭───────────╮',
    r1: '     ╱╭───',
    r2: '    ▕▕  ',
    r3: '     ╲╰── ',
    r4: '      ╰──────┬──────╯',
    r5: '       ╲    ',
    r6: '        ╲  ',
    r7: '         ╲ ',
    r8: '          ╲',
  },
  hovering: {
    r0: '',
    r1: '      ╭───────────╮',
    r2: '     ╱╭─── ◉◉ ───╮╲',
    r3: '    ▕▕  CHACRAM   ▏▏',
    r4: '     ╲╰── ▐▓▓▓▌ ──╯╱',
    r5: '      ╰──────┬──────╯',
    r6: '       ╲    ░░░    ╱',
    r7: '        ╲  ░░░░  ╱',
    r8: '         ╲ ░░░░ ╱',
  },
};

// Apple Terminal simplification (no bg-fill trick needed for this design)
const APPLE_UFO = {
  default: {
    r0: '      ╭───────────╮',
    r1: '     ╱            ╲',
    r2: '    ▕▕  CHACRAM   ▏▏',
    r3: '     ╲            ╱',
    r4: '      ╰──────┬──────╯',
    r5: '       ╲    ░░░    ╱',
    r6: '        ╲  ░░░░  ╱',
    r7: '         ╲ ░░░░ ╱',
    r8: '          ╲░░░░╱',
  },
  hovering: {
    r0: '',
    r1: '      ╭───────────╮',
    r2: '     ╱            ╲',
    r3: '    ▕▕  CHACRAM   ▏▏',
    r4: '     ╲            ╱',
    r5: '      ╰──────┬──────╯',
    r6: '       ╲    ░░░    ╱',
    r7: '        ╲  ░░░░  ╱',
    r8: '         ╲ ░░░░ ╱',
  },
};

export function Clawd(t0: { pose?: UFOPose }) {
  const $ = _c(22);
  const { pose = 'default' } = t0 === undefined ? {} : t0;

  // Apple Terminal gets simplified version
  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalUFO pose={pose} />;
  }

  const u = UFO[pose];

  return (
    <Box flexDirection="column">
      {/* Row 0: dome top */}
      {pose !== 'hovering' ? (
        <Text color="text">{u.r0}</Text>
      ) : null}

      {/* Row 1: dome + alien eyes (yellow) */}
      <Text>
        <Text color="text">{u.r1}</Text>
        {env.terminal !== 'Apple_Terminal' ? (
          <Text color="warning">◉◉</Text>
        ) : (
          <Text color="text">  </Text>
        )}
        <Text color="text">{' ───╮╲'}</Text>
      </Text>

      {/* Row 2: body with CHACRAM text (bold, accent) */}
      <Text>
        <Text color="text">{u.r2}</Text>
        <Text bold color="text">
          CHACRAM
        </Text>
        <Text color="text">{'   ▏▏'}</Text>
      </Text>

      {/* Row 3: engine lights (warning/orange glow) */}
      <Text>
        <Text color="text">{u.r3}</Text>
        <Text color="warning">{'▐▓▓▓▌'}</Text>
        <Text color="text">{' ──╯╱'}</Text>
      </Text>

      {/* Row 4: saucer bottom */}
      <Text color="text">{u.r4}</Text>

      {/* Row 5-8: tractor beam (cyan, progressive width) */}
      <Text>
        <Text color="text">{u.r5}</Text>
        <Text color="cyanBright">{'░░░'}</Text>
        <Text color="text">{'    ╱'}</Text>
      </Text>
      <Text>
        <Text color="text">{u.r6}</Text>
        <Text color="cyanBright">{'░░░░'}</Text>
        <Text color="text">{'  ╱'}</Text>
      </Text>
      <Text>
        <Text color="text">{u.r7}</Text>
        <Text color="cyanBright">{'░░░░'}</Text>
        <Text color="text">{' ╱'}</Text>
      </Text>
      <Text>
        <Text color="text">{u.r8}</Text>
        <Text color="cyanBright">{'░░░░'}</Text>
        <Text color="text">{pose === 'hovering' ? '╱' : '╱'}</Text>
      </Text>
    </Box>
  );
}

function AppleTerminalUFO({ pose }: { pose: UFOPose }) {
  const u = APPLE_UFO[pose];

  return (
    <Box flexDirection="column">
      {pose !== 'hovering' ? (
        <Text color="text">{u.r0}</Text>
      ) : null}
      <Text color="text">{u.r1}</Text>
      <Text>
        <Text color="text">{'    ▕▕  '}</Text>
        <Text bold color="text">CHACRAM</Text>
        <Text color="text">{'   ▏▏'}</Text>
      </Text>
      <Text color="text">{u.r3}</Text>
      <Text color="text">{u.r4}</Text>
      <Text color="text">{u.r5}</Text>
      <Text color="text">{u.r6}</Text>
      <Text color="text">{u.r7}</Text>
      <Text color="text">{u.r8}</Text>
    </Box>
  );
}
