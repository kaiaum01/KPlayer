export interface KpTheme {
  id: string;
  name: string;
  bg: string;
  panel: string;
  elevated: string;
  text: string;
  muted: string;
  accent: string;
  dim: string;
}

// Exact 7 RGB themes from source/kplayer.c lines 756-764
export const KP_THEMES: KpTheme[] = [
  {
    id: 'black-green',
    name: 'Preto e verde',
    bg: 'rgb(18, 18, 18)',
    panel: 'rgb(24, 24, 24)',
    elevated: 'rgb(36, 36, 36)',
    text: 'rgb(255, 255, 255)',
    muted: 'rgb(179, 179, 179)',
    accent: 'rgb(29, 185, 84)',
    dim: 'rgb(145, 145, 145)',
  },
  {
    id: 'black-white',
    name: 'Preto e branco',
    bg: 'rgb(15, 15, 15)',
    panel: 'rgb(28, 28, 28)',
    elevated: 'rgb(45, 45, 45)',
    text: 'rgb(255, 255, 255)',
    muted: 'rgb(190, 190, 190)',
    accent: 'rgb(245, 245, 245)',
    dim: 'rgb(150, 150, 150)',
  },
  {
    id: 'white-black',
    name: 'Branco e preto',
    bg: 'rgb(248, 248, 248)',
    panel: 'rgb(233, 233, 233)',
    elevated: 'rgb(218, 218, 218)',
    text: 'rgb(20, 20, 20)',
    muted: 'rgb(70, 70, 70)',
    accent: 'rgb(25, 25, 25)',
    dim: 'rgb(90, 90, 90)',
  },
  {
    id: 'green-black',
    name: 'Verde e preto',
    bg: 'rgb(133, 218, 150)',
    panel: 'rgb(166, 231, 179)',
    elevated: 'rgb(190, 239, 199)',
    text: 'rgb(12, 35, 18)',
    muted: 'rgb(32, 78, 43)',
    accent: 'rgb(10, 45, 20)',
    dim: 'rgb(39, 91, 50)',
  },
  {
    id: 'black-blue',
    name: 'Preto e azul',
    bg: 'rgb(11, 17, 29)',
    panel: 'rgb(19, 29, 46)',
    elevated: 'rgb(31, 45, 68)',
    text: 'rgb(245, 249, 255)',
    muted: 'rgb(178, 193, 212)',
    accent: 'rgb(102, 182, 255)',
    dim: 'rgb(149, 165, 184)',
  },
  {
    id: 'black-purple',
    name: 'Preto e roxo',
    bg: 'rgb(22, 15, 30)',
    panel: 'rgb(35, 24, 45)',
    elevated: 'rgb(52, 38, 65)',
    text: 'rgb(252, 245, 255)',
    muted: 'rgb(204, 187, 215)',
    accent: 'rgb(211, 153, 255)',
    dim: 'rgb(170, 150, 184)',
  },
  {
    id: 'black-red',
    name: 'Preto e vermelho',
    bg: 'rgb(24, 14, 15)',
    panel: 'rgb(39, 23, 24)',
    elevated: 'rgb(59, 35, 36)',
    text: 'rgb(255, 246, 246)',
    muted: 'rgb(218, 185, 185)',
    accent: 'rgb(255, 139, 139)',
    dim: 'rgb(185, 149, 149)',
  },
];
