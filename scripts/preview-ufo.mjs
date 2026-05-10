#!/usr/bin/env node
/**
 * UFO Logo Preview with ANSI colors
 * Run: node scripts/preview-ufo.mjs
 */

// ANSI escape codes
const R = '\x1b[0m';       // reset
const B = '\x1b[1m';       // bold
const WARN = '\x1b[33m';   // yellow (warning)
const ORANGE = '\x1b[38;5;208m'; // orange (engine)
const CYAN = '\x1b[96m';   // cyan bright (beam)
const BODY = '\x1b[37m';   // white

const logo = [
  `      ╭───────────╮`,
  `     ╱╭─── ${WARN}◉◉${R}${BODY} ───╮╲`,
  `    ▕▕  ${B}CHACRAM${R}${BODY}   ▏▏`,
  `     ╲╰── ${ORANGE}▐▓▓▓▌${R}${BODY} ──╯╱`,
  `      ╰──────┬──────╯`,
  `       ╲    ${CYAN}░░░${R}${BODY}    ╱`,
  `        ╲  ${CYAN}░░░░${R}${BODY}  ╱`,
  `         ╲ ${CYAN}░░░░${R}${BODY} ╱`,
  `          ╲${CYAN}░░░░${R}${BODY}╱`,
];

console.log('\n' + logo.join('\n') + '\n');
