// msh: the maxOS shell. Output lines are HTML built here, with every user-typed value escaped.
import { owner, work, personal, concepts, findWork } from '../data/site';
import { SCENES } from './scene';
import { APPS, APP, esc, host, stackTop } from './store';

export const PROMPT = '<span class="c1">max@maxos ~ %</span>';
const VISIBLE = ['help', 'ls', 'open', 'whoami', 'about', 'contact', 'neofetch', 'theme', 'scene', 'history', 'clear', 'sudo', 'exit'];
const OPENABLE = () => [...work.map((p) => p.key), ...APPS.map((a) => a.id), ...personal.map((p) => p.key), ...concepts.map((p) => p.key)];
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, Math.max(n, s.length + 1));
const T0 = Date.now();

// the shell's state outlives its window; these are the only places it changes
export function subscribe(term, fn) {
  term.listener = fn;
  return () => { if (term.listener === fn) term.listener = null; };
}
export function historyStep(term, dir) {
  const hi = term.hi + dir;
  if (hi < 0 || hi > term.hist.length) return null;
  term.hi = hi;
  return term.hist[hi] || '';
}

export function newTerm() {
  return {
    hist: [], hi: 0, vim: false, listener: null,
    lines: [
      '<div><span class="c3">maxOS 26</span> <span class="c2">· msh 1.0</span></div>',
      '<div class="c2">type help to see what this can do. tab completes, ↑ ↓ walk history.</div>',
    ],
  };
}

function uptime() {
  const s = Math.floor((Date.now() - T0) / 1000);
  return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}

// ctx: { term, get() -> os state, actions, theme() -> 'light'|'dark', reduced(), closeSelf(), shake() }
export function runCommand(raw, ctx) {
  const { term, actions } = ctx;
  const out = (html) => {
    term.said = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    term.lines.push(`<div>${html}</div>`);
    if (term.lines.length > 400) term.lines.splice(0, 50);
    if (term.listener) term.listener();
  };
  const say = (txt, cls) => out(cls ? `<span class="${cls}">${esc(txt)}</span>` : esc(txt));
  const rmJoke = () => {
    say('removing / ...', 'c2');
    setTimeout(() => {
      say('just kidding. moved one bad idea to the trash.');
      actions.setTrash([...ctx.get().trash, ['file', 'rm-rf-attempt.log', 'filed under: nice try']]);
      ctx.shake();
    }, 500);
  };

  const cmd = raw.trim();
  out(`${PROMPT} ${esc(cmd)}`);
  if (!cmd) return;
  term.hist.push(cmd);
  term.hi = term.hist.length;
  if (term.vim) {
    if (/^:(q!?|wq|x)$/.test(cmd)) { term.vim = false; say('you escaped vim. put that on the resume.'); } else say('-- INSERT --  (you live here now. :q to leave)', 'c2');
    return;
  }
  const [c0, ...args] = cmd.split(/\s+/), c = c0.toLowerCase(), a = args.join(' ').toLowerCase();
  const s = ctx.get();
  switch (c) {
    case 'help':
      out('<span class="c3">commands</span>\n' + [
        ['help', 'this list'], ['ls [work|personal]', 'see what is here'], ['open <name>', 'open a project or app'],
        ['whoami', 'who is at the keyboard'], ['about', 'the short version'], ['contact', 'how to reach max'],
        ['neofetch', 'system summary'], ['theme [light|dark]', 'switch the glass'], ['scene [day|dusk|night|snow]', 'change the world'],
        ['history', 'what you typed'], ['clear', 'clean slate'], ['sudo', 'go on, try it'], ['exit', 'close the terminal'],
      ].map(([k, d]) => `  <span class="c1">${esc(pad(k, 29))}</span>${esc(d)}`).join('\n'));
      break;
    case 'ls': case 'dir':
      if (!a) out(['work/', 'personal/', 'trash/'].map((x) => `<span class="c1">${x}</span>`).join('  ') + '  about.txt  mail.app  terminal.app  scenes.app');
      else if (a.startsWith('work')) { out(work.map((p) => `<span class="c1">${esc(pad(p.key, 16))}</span>${esc(p.title)}`).join('\n')); say('open <name> to look inside.', 'c2'); }
      else if (a.startsWith('personal')) out(personal.map((p) => `<span class="c1">${esc(pad(p.key, 16))}</span>${esc(p.title)}`).join('\n') + '\n' + concepts.map((p) => `<span class="c1">${esc(pad(p.key, 16))}</span>${esc(p.title)} <span class="c2">(concept)</span>`).join('\n'));
      else if (a.startsWith('trash')) out(s.trash.length ? s.trash.map((t) => esc(t[1])).join('\n') : '<span class="c2">empty</span>');
      else say(`ls: ${a}: no such directory`);
      break;
    case 'open': case 'cd': {
      if (c === 'cd' && !a) { say("there's nowhere else to go. this is the desktop."); break; }
      if (!a) { say('usage: open <name>. try ls work.'); break; }
      const p = findWork(a), pe = personal.find((x) => x.key === a) || concepts.find((x) => x.key === a);
      if (p) { say(`opening ${p.title}`, 'c2'); actions.open('project', { key: a }, ctx.origin()); }
      else if (APP[a]) { say(`opening ${APP[a].label}`, 'c2'); actions.openApp(a, ctx.origin()); }
      else if (pe) { say(`opening ${pe.title} in personal`, 'c2'); actions.open('files', { tab: 'personal', flash: pe.key }, ctx.origin()); }
      else say(c === 'cd' ? `cd: ${a}: try open ${a}` : `open: ${a}: not found. try ls work.`);
      break;
    }
    case 'whoami': out(`you: a guest\nhost: <span class="c3">${esc(owner.name)}</span>, ${esc(owner.title)}`); break;
    case 'about': out(owner.about.map((l) => '- ' + esc(l)).join('\n')); break;
    case 'contact':
      out(`email     <a href="mailto:${esc(owner.email)}">${esc(owner.email)}</a>\ngithub    <a href="${esc(owner.github)}" target="_blank" rel="noopener">${esc(host(owner.github))}</a>\nlinkedin  <a href="${esc(owner.linkedin)}" target="_blank" rel="noopener">${esc(host(owner.linkedin))}</a>\n<span class="c2">or type open mail.</span>`);
      break;
    case 'neofetch': case 'fetch': {
      const art = ['        /\\', '       /  \\    /\\', '      /    \\  /  \\', '     /  /\\  \\/    \\', '    /  /  \\  \\     \\', '   ~~~~~~~~~~~~~~~~~~', '    ~ ~ ~ ~ ~ ~ ~ ~', '', '', '', '', '', ''];
      const info = [
        ['', '<span class="c1">guest@maxos</span>'], ['', '-----------'], ['os', 'maxOS 26'], ['host', 'maxharris.io'],
        ['owner', `${esc(owner.name)}, ${esc(owner.title)}`], ['shell', 'msh 1.0'], ['uptime', uptime()],
        ['scene', `${s.scene} · immersion ${Math.round(s.imm * 100)}%`], ['glass', ctx.theme()],
        ['work', `${work.length} projects`], ['personal', `${personal.length} projects, ${concepts.length} concepts`],
        ['stack', esc(stackTop.slice(0, 4).map((x) => x[0]).join(', '))], ['display', `${window.innerWidth}x${window.innerHeight}`],
      ];
      out(info.map((r, i) => `<span class="c1">${esc(pad(art[i] || '', 24))}</span>${r[0] ? `<span class="c1">${pad(r[0], 9)}</span>` : ''}${r[1]}`).join('\n'));
      break;
    }
    case 'theme':
      if (a === 'light' || a === 'dark') actions.setTheme(a);
      else if (!a) actions.toggleTheme();
      else { say('theme: light or dark'); break; }
      say('glass: ' + (a || (ctx.theme() === 'dark' ? 'light' : 'dark')), 'c2');
      break;
    case 'scene': case 'env':
      if (SCENES.includes(a)) { actions.setScene(a); say('scene: ' + a, 'c2'); } else say(`scene: ${s.scene}. options: ${SCENES.join(' ')}`);
      break;
    case 'history': out(term.hist.map((h, i) => `${String(i + 1).padStart(4)}  ${esc(h)}`).join('\n')); break;
    case 'clear': term.lines = []; if (term.listener) term.listener(); break;
    case 'sudo':
      if (/make me a sandwich/.test(a)) say('okay.');
      else if (/rm\s+-rf/.test(a)) rmJoke();
      else say("nice try. you're not in the sudoers file. this incident will be reported.");
      break;
    case 'exit': case 'logout': say('bye.', 'c2'); setTimeout(ctx.closeSelf, 300); break;
    // the rest are not in help on purpose
    case 'vim': case 'vi': case 'nvim': term.vim = true; out('<span class="c2">~\n~\n~</span>\n-- INSERT --'); break;
    case 'rm': if (/-rf|-fr/.test(a)) rmJoke(); else say('rm: nothing here is yours to delete.'); break;
    case 'make': say(/sandwich/.test(a) ? 'what? make it yourself.' : "make: *** no rule to make target. (it's a website.)"); break;
    case 'coffee': case 'brew': say("error 418: i'm a teapot."); break;
    case 'fireworks':
      if (ctx.reduced()) say('fireworks are off because your system asks for less motion.');
      else { say('look outside.', 'c2'); actions.fireworks(); }
      break;
    case 'hike': case 'climb': say("you can't climb these. every mountain out there is made of a seed and some sine waves."); break;
    case 'hi': case 'hello': case 'hey': say("hi. most people never open the terminal. you're one of the good ones."); break;
    case 'pwd': say('/users/guest/desktop'); break;
    case 'date': say(new Date().toString().toLowerCase()); break;
    case 'echo': say(args.join(' ')); break;
    case '42': say('the answer. now, what was the question?'); break;
    default: say(`msh: command not found: ${c0}. try help.`);
  }
}

export function complete(value, term) {
  const parts = value.split(' '), last = parts[parts.length - 1].toLowerCase();
  let pool = [];
  if (parts.length === 1) pool = VISIBLE;
  else {
    const c = parts[0].toLowerCase();
    pool = c === 'open' ? OPENABLE() : c === 'ls' ? ['work', 'personal', 'trash'] : c === 'theme' ? ['light', 'dark'] : c === 'scene' ? SCENES : [];
  }
  const m = pool.filter((x) => x.startsWith(last));
  if (m.length === 1) { parts[parts.length - 1] = m[0]; return parts.join(' ') + ' '; }
  if (m.length > 1) {
    let pre = m[0];
    m.forEach((x) => { while (!x.startsWith(pre)) pre = pre.slice(0, -1); });
    if (pre.length > last.length) { parts[parts.length - 1] = pre; return parts.join(' '); }
    term.lines.push(`<div>${PROMPT} ${esc(value)}</div>`, `<div><span class="c2">${esc(m.join('  '))}</span></div>`);
    if (term.listener) term.listener();
  }
  return value;
}
