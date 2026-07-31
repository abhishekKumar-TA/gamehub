const adjectives = [
  'SWIFT', 'BRAVE', 'HAPPY', 'FUNKY', 'LUCKY', 'WILD', 'COOL', 'EPIC',
  'BOLD', 'KEEN', 'ZANY', 'FIZZY', 'GOLD', 'IRON', 'JADE', 'RUBY',
  'NEON', 'STAR', 'MINT', 'COZY', 'MEGA', 'PINK', 'DARK', 'BLUE',
];

const nouns = [
  'PANDA', 'TIGER', 'EAGLE', 'SHARK', 'WOLF', 'BEAR', 'HAWK', 'LYNX',
  'COBRA', 'ORCA', 'RAVEN', 'VIPER', 'FOX', 'LION', 'STAG', 'CROW',
  'OWL', 'BULL', 'DEER', 'DUCK', 'SEAL', 'YETI', 'GOAT', 'MOLE',
];

export function generateRoomCode(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `${adj}-${noun}-${num}`;
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z]+-[A-Z]+-\d{2}$/.test(code.toUpperCase());
}
