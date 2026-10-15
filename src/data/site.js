// Everything the site says. Work projects come from ~/Desktop/ebshome; set `hidden: true` to take
// one off the site without losing its write-up. Images live in public/images/{work,personal}.

const base = import.meta.env.BASE_URL;
const img = (dir, key) => ({ src: `${base}images/${dir}/${key}.webp`, thumb: `${base}images/${dir}/${key}-thumb.webp` });

export const owner = {
  name: 'max harris',
  title: 'developer+',
  blurb: 'creating digital solutions and more',
  about: [
    'experience with software development on web, ios, android, windows, and linux',
    'i enjoy solving problems and making new ones',
    'these days i build the cloud side of a point-of-sale company: the apps store owners run their shops from, the online stores their customers order from, and the tools that keep it all running.',
  ],
  email: 'maxwilliamharris@gmail.com',
  github: 'https://github.com/maxwharris',
  linkedin: 'https://www.linkedin.com/in/maxwilliamharris/',
};

const allWork = [
  {
    key: 'manager',
    title: 'EBS Manager',
    icon: 'chart',
    tagline: "a store owner's whole back office, read live from the register",
    description: "the web back office for independent grocery and convenience stores. owners check today's sales, edit their catalog, design shelf labels, run payroll, receive vendor invoices and handle uber eats and web orders. every screen reads and writes live to the sql server inside the shop, so it always matches the register.",
    highlights: [
      "30+ reports in 9 hubs named after an owner's questions, with hand-drawn svg charts",
      'ask for a report in plain english, and claude finds the right one and the date range',
      'ai invoice receiving: drop in a vendor pdf, get every line item matched to the catalog',
      'drag-and-drop label designer for thermal printers and electronic shelf labels',
    ],
    stack: ['react', 'vite', 'tailwind', 'node/express', 'mysql', 'sql server bridge', 'claude api'],
    stats: [['591', 'commits'], ['~100', 'pages'], ['88k', 'lines of react']],
    role: 'solo, jan 2026 - now',
    link: 'https://manager.ebspos.com',
    linkLabel: 'manager.ebspos.com',
    shots: ['manager', 'manager-2', 'manager-3'],
  },
  {
    key: 'storefront',
    title: 'EBSPOS Storefront',
    icon: 'cart',
    tagline: 'white-label online shops for corner stores, wired into the register',
    description: "every store on ebspos gets its own online shop, stocked straight from its register so prices, deals and loyalty points match the till. customers pay by card and pick pickup, courier or shipping. orders ping staff phones in seconds, and once packed they land in the store's register as a real sale.",
    highlights: [
      'catalog, promotions, bundle deals and weighed items copied from the in-store register',
      'card checkout, push alerts to staff, barcode-scanner picking with substitutions',
      'uber direct courier delivery priced from live quotes, plus shipping and store delivery',
      'a smoke test that drives real chrome after every deploy',
    ],
    stack: ['react', 'tailwind', 'node/express', 'mysql', 'authorize.net', 'uber direct', 'twilio'],
    stats: [['431', 'commits'], ['188', 'api routes'], ['116', 'migrations']],
    role: 'solo, mar 2026 - now',
    link: 'https://shop.ebspos.com/berrygoods',
    linkLabel: 'shop.ebspos.com',
    shots: ['storefront', 'storefront-2'],
  },
  {
    key: 'simplemanager',
    title: 'EBS SimpleManager',
    icon: 'phone',
    tagline: "a grocery store's back office in your pocket: scan, reprice, receive, ship",
    description: 'an ios and android app, live on the app store, for running the store from the aisle. scan a barcode to look up or reprice an item, receive deliveries, print shelf labels on a bluetooth printer, and pick web, uber eats and doordash orders.',
    highlights: [
      'camera barcode scanning plus native swift/java plugins for sled scanners and zebra printers',
      'price edits reach the registers immediately, on store wi-fi or through the cloud',
      'order picking with found / short / substituted states and automatic refunds',
    ],
    stack: ['react', 'typescript', 'ionic', 'capacitor', 'swift', 'java', 'ml kit'],
    stats: [['429', 'commits'], ['33', 'screens'], ['v1.9', 'on ios + android']],
    role: 'lead developer, took over and shipped',
    link: 'https://apps.apple.com/us/app/ebs-simplemanager/id6753764088',
    linkLabel: 'app store',
    shots: ['simplemanager'],
  },
  {
    key: 'euno',
    title: 'EUNO',
    icon: 'eye',
    tagline: 'a command center for a fleet of ai coding agents, built for vision pro',
    description: "the private command center i built to run my workday, where much of the engineering is done by many claude code sessions side by side. it shows which agents are waiting on me, keeps one todo list people and agents both write to, turns every commit into a plain-english calendar, and sends alerts to my phone and watch. a native vision pro app lets me answer sessions by voice.",
    highlights: [
      "a 'needs you' inbox across every running ai session, with their live tool calls",
      'native visionos app in swiftui: a wall of sessions, on-device dictation, spoken replies',
      'a shared todo cli for people and agents, with severity and reply threads',
      'nightly dev log: 2,537 commits rewritten in plain english for $2.06',
    ],
    stack: ['node', 'vanilla js', 'swiftui', 'visionos', 'claude code', 'claude api'],
    stats: [['108', 'commits in 6 weeks'], ['7.7k', 'lines of swift'], ['48', 'api endpoints']],
    role: 'solo, internal tool',
    link: '',
    linkLabel: 'private, runs on my own network',
    shots: ['euno'],
  },
  {
    key: 'admin',
    title: 'EBS Admin',
    icon: 'map',
    tagline: 'the control room behind a 600-store point-of-sale cloud',
    description: 'the internal dashboard the team uses to run the whole platform: set up and configure about 600 stores, watch servers and store connections, track delivery and ai spending, and publish docs. the standout is an interactive system map with live status and step-by-step stories in english or korean.',
    highlights: [
      'system map: 53 parts and 82 connections, 10 animated stories, live server heartbeats',
      "'ask the docs': claude answers staff questions from 35 internal docs, with sources",
      'store map, uptime lanes for canary stores, and cost tracking per store and model',
    ],
    stack: ['react', 'vite', 'tailwind', 'google maps', 'node/express', 'claude api'],
    stats: [['216', 'commits'], ['42', 'routes'], ['2', 'languages']],
    role: 'solo, jan 2026 - now',
    link: '',
    linkLabel: 'internal',
    shots: ['admin', 'admin-2'],
  },
  {
    key: 'channels',
    hidden: true,
    title: 'Sales Channels',
    icon: 'plug',
    tagline: 'one register catalog, listed on uber eats, instacart and mercato',
    description: "keeps a store's in-store inventory listed on delivery marketplaces. instacart and mercato get scheduled catalog files, uber eats gets a full api integration, and marketplace orders come back into the same queue as web orders and get booked into the register as real sales.",
    highlights: [
      'uber eats end to end: store connect, menu push, live out-of-stock, pause and resume',
      'signed webhook order intake with substitutions synced back to uber',
      'flip one stock switch and every channel updates',
    ],
    stack: ['node/express', 'mysql', 'uber eats api', 'sftp', 'node-cron'],
    stats: [['218', 'commits'], ['5', 'channels'], ['61', 'api routes']],
    role: 'solo, jan 2026 - now',
    link: '',
    linkLabel: 'inside ebs manager',
    shots: ['channels'],
  },
  {
    key: 'chatebs',
    hidden: true,
    title: 'ChatEBS',
    icon: 'chat',
    tagline: "ask your store's sales data anything, by text or voice",
    description: 'an ai assistant inside the manager app, with a companion mobile app. owners ask "what were my top sellers last week?" and it queries their own pos database, then answers with a table they can download. it also answers how-to and hardware questions from the manuals.',
    highlights: [
      'one streaming tool-calling agent instead of a six-step llm pipeline',
      'the model never writes sql: a guarded query builder whitelists tables and caps rows',
      'hybrid vector + keyword search over pos manuals, and voice mode on mobile',
    ],
    stack: ['node/express', 'openai tool calling', 'mysql', 'redis', 'react', 'capacitor'],
    stats: [['130', 'commits'], ['10', 'whitelisted tables'], ['sse', 'streaming']],
    role: 'solo',
    link: '',
    linkLabel: 'inside ebs manager',
    shots: ['chatebs'],
  },
  {
    key: 'ebspos',
    title: 'ebspos.com',
    icon: 'globe',
    tagline: 'the website for a pos company serving 2,700+ independent stores',
    description: 'the public site for ebspos. i rebuilt it as a react and tailwind app that walks through the whole product line, with a help center of video tutorials and a merchant application in english, korean and spanish.',
    highlights: [
      'merchant application in 3 languages; uploads are merged into one pdf for sales',
      'product pages for the register, back office, web and mobile apps, delivery and labels',
      'csp, subresource integrity, rate-limited forms, redirects that keep old urls alive',
    ],
    stack: ['react', 'vite', 'tailwind', 'node/express', 'pdfkit'],
    stats: [['2', 'redesigns'], ['3', 'languages'], ['11', 'video tutorials']],
    role: 'solo',
    link: 'https://ebspos.com',
    linkLabel: 'ebspos.com',
    shots: ['ebspos', 'ebspos-2'],
  },
  {
    key: 'nems',
    hidden: true,
    title: 'Northeast Merchant Supply',
    icon: 'box',
    tagline: 'a wholesale shop for pos hardware, built start to finish in a week',
    description: "an online shop where merchants buy card terminals, pinpads and accessories at wholesale prices: storefront, api, and back office. prices show only after sign-in, and the card number never touches the shop's server.",
    highlights: [
      'card tokenized in the browser with accept.js; order, stock, charge in one transaction',
      'per-state sales tax and tax-exempt accounts',
      'back office built into the existing admin site',
    ],
    stack: ['react', 'tailwind', 'node/express', 'mysql', 'authorize.net'],
    stats: [['7', 'days'], ['56', 'api endpoints'], ['15', 'tables']],
    role: 'solo, june 2026',
    link: 'https://northeastmerchantsupply.com',
    linkLabel: 'northeastmerchantsupply.com',
    shots: ['nems'],
  },
];

export const work = allWork
  .filter((p) => !p.hidden)
  .map((p) => ({ ...p, images: p.shots.map((s) => img('work', s)) }));

// status: 'live' while it is up, 'retired' once it is not (the write-up stays, the link goes), or
// 'building' for an in-progress section. A project without a screenshot (shot: false) shows its
// app icon if it has one (appIcon), otherwise a drawn glyph (icon).
export const personal = [
  {
    key: 'dahw',
    status: 'live',
    shot: false,
    icon: 'wave',
    appIcon: { light: `${base}images/personal/dahw-icon.webp`, dark: `${base}images/personal/dahw-icon-dark.webp` },
    title: 'DAHW',
    tags: ['Swift', 'SwiftUI', 'AVAudioEngine', 'C++'],
    description: 'digital audio handheld workstation: a daw for iphone, built native in swift around a c++ dsp core. tracks, clips and devices sized for one hand, with a sampler at its heart: record or import any audio, even the sound from a video, then set markers, loop, warp and play it across the keys. fully local, no account. in development.',
    link: 'https://maxharris.io/dahw',
  },
  { key: 'polymono', status: 'live', title: 'PolyMono', description: 'new york themed monopoly game (private)', link: 'https://mp.maxharris.io' },
  { key: 'kruppholdings', status: 'live', title: 'Krupp Holdings site', description: 'company website for krupp holdings investment group', link: 'https://kruppholdings.com' },
  { key: 'wavshare', status: 'retired', title: 'wavshare.io', description: "an 'open source' music sharing platform where users can download shared tracks and share remixes", link: '' },
].map((p) => ({ ...p, image: p.shot === false ? null : img('personal', p.key) }));

export const concepts = [
  { key: 'produck', title: 'Produck', tags: ['Next.js', 'React Native', 'MongoDB'], description: 'A modern social platform for discovering, reviewing, and sharing products with your community. Features product discovery, social reviews, category organization, and cross-platform mobile app with offline support.', link: 'https://github.com/maxwharris/Produck' },
  { key: 'inkatlas', title: 'Ink Atlas', tags: ['React', 'Node.js', 'AR'], description: 'A comprehensive social platform for tattoo discovery, logging, and sharing. Features AR try-on, artist profiles, booking system, and community-driven tattoo exploration with location-based artist search.' },
  { key: 'osphere', title: 'osphere.io', tags: ['React', 'Node.js', 'Socket.io'], description: 'A social media platform (osphere) built with modern web technologies. Features real-time messaging, user authentication, file uploads, and comprehensive social networking capabilities.', link: 'https://github.com/maxwharris/osphere' },
  { key: 'icontrol', title: 'iControl', tags: ['Python', 'OpenCV', 'PyAutoGUI'], description: 'An eye-tracking cursor control system using computer vision. Leverages OpenCV for eye detection and PyAutoGUI for cursor manipulation, enabling hands-free computer interaction.', link: 'https://github.com/maxwharris/eye-control' },
  { key: 'jarvis', title: 'jarvis', tags: ['Python', 'Ollama', 'PyQt6'], description: 'A comprehensive AI assistant with voice control, file management, and app automation. Features local LLM integration, screen analysis, Discord/Spotify control, and privacy-focused design with SQLite database.', link: 'https://github.com/maxwharris/jarvis' },
  { key: 'skinmax', title: 'skinmax', tags: ['Steam API', 'Node.js', 'MongoDB'], description: 'A CSGO skin trading platform with Steam integration. Features inventory viewing with live prices, trade listings, automated trade matching, and store-bot trading with fund management.', link: 'https://github.com/maxwharris/skinmax' },
].map((p) => ({ ...p, image: img('personal', p.key) }));

export const findWork = (key) => work.find((p) => p.key === key);
