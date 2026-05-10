const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const YELLOW = '\x1b[33m';
const ORANGE = '\x1b[38;5;208m';
const CYAN = '\x1b[96m';
const WHITE = '\x1b[37m';

process.stdout.write('\n'
  + '      \u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e\n'
  + '     \u2571\u256d\u2500\u2500\u2500 ' + YELLOW + '\u25c9\u25c9' + RESET + WHITE + ' \u2500\u2500\u2500\u256e\u2572\n'
  + '    \u2595\u2595  ' + BOLD + 'CHACRAM' + RESET + WHITE + '   \u258f\u258f\n'
  + '     \u2572\u2570\u2500\u2500 ' + ORANGE + '\u2590\u2593\u2593\u2593\u258c' + RESET + WHITE + ' \u2500\u2500\u256f\u2571\n'
  + '      \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u256f\n'
  + '       \u2572    ' + CYAN + '\u2591\u2591\u2591' + RESET + WHITE + '    \u2571\n'
  + '        \u2572  ' + CYAN + '\u2591\u2591\u2591\u2591' + RESET + WHITE + '  \u2571\n'
  + '         \u2572 ' + CYAN + '\u2591\u2591\u2591\u2591' + RESET + WHITE + ' \u2571\n'
  + '          \u2572' + CYAN + '\u2591\u2591\u2591\u2591' + RESET + WHITE + '\u2571\n'
  + RESET + '\n'
);
