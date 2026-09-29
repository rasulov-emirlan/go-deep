import type { Actor, Frame, Prop } from '../../components/Story'

/* The gatekeeper: apps on the left, the kernel (knight) behind the wall on the right. */
const app = (x: number, bubble?: string, hot?: boolean): Actor => ({ id: 'app', sprite: 'misc-standing-left', x, y: 320, h: 120, tag: 'your app', bubble, hot })
const buggy = (bubble?: string, hot?: boolean): Actor => ({ id: 'bug', sprite: 'science-experiment-mishap', x: 70, y: 320, h: 120, tag: 'buggy app', bubble, hot })
const stuff = (x: number, tone: Prop['tone'] = 'ink'): Prop => ({ id: 'stuff', x, y: 60, w: 170, h: 70, tone, text: 'hardware' })
const wall: Prop = { id: 'wall', x: 520, y: 20, w: 16, h: 320, tone: 'ink' }

export const gatekeeper: Frame[] = [
  {
    caption: 'With no wall, every program can touch the disk and each other’s memory.',
    actors: [app(260), buggy()],
    props: [stuff(590)],
  },
  {
    caption: 'One buggy program scribbles everywhere and the whole machine goes down.',
    actors: [app(260, 'my data!', true), buggy('oops', true)],
    props: [stuff(590, 'red')],
  },
  {
    caption: 'Hardware adds a wall: user mode is limited, kernel mode is fully trusted.',
    actors: [app(260), buggy(), { id: 'kernel', sprite: 'fairy-tale-armored-knight', x: 660, y: 330, h: 150, tag: 'kernel' }],
    props: [stuff(590), wall],
  },
  {
    caption: 'The only door is one the kernel registered. You ask by number.',
    actors: [app(400, 'write, please'), buggy(), { id: 'kernel', sprite: 'fairy-tale-armored-knight', x: 660, y: 330, h: 150, tag: 'kernel', bubble: '#1: ok' }],
    props: [stuff(590), wall, { id: 'door', x: 500, y: 250, w: 56, h: 90, tone: 'red', text: 'door' }],
    stop: {
      title: 'What makes the wall real',
      body: <p>Four hardware pieces: privilege levels, a user/supervisor bit on every page, one kernel-registered entry point, and a timer interrupt.</p>,
    },
  },
  {
    caption: 'A timer interrupt lets the kernel take the CPU back from any hog.',
    actors: [{ id: 'app', sprite: 'misc-with-candy', x: 400, y: 320, h: 120, tag: 'hog', bubble: 'mine!', hot: true }, { id: 'kernel', sprite: 'fairy-tale-armored-knight', x: 660, y: 330, h: 150, tag: 'kernel', bubble: 'tick!' }],
    props: [stuff(590), wall],
  },
]
