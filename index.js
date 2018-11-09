#!/usr/bin/env node
const isVideo = require('is-video');
const boolean = require('boolean');
const sqlite = require('sqlite');
const wiki = require('wikijs').default;
const youtube = require('@wikipedia-tts/youtube');
const english = require('@wikipedia-tts/english');
const video = require('@wikipedia-tts/video');
const https = require('https');
const path = require('path');
const cp = require('child_process');


// Global variables
const E = process.env;
const A = process.argv;
const LOG = boolean(E['WIKIPEDIATTS_LOG']||'0');
const DB = E['WIKIPEDIATTS_DB']||'crawl.db';
const CATEGORY_EXC = /wikipedia|webarchive|infocard|infobox|chembox|article|page|dmy|cs1|[^\w\s\(\)]/i;
const PAGEIMAGES_URL = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=';
const BLANKIMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Wikipedia-logo-blank.svg/1000px-Wikipedia-logo-blank.svg.png';
const ROW_DEFAULT = {priority: 0, references: 0, status: 0};


// Make HTTPS GET request.
function httpsGet(opt) {
  return new Promise((fres, frej) => {
    var req = https.get(opt, (res) => {
      var err = null, cod = res.statusCode, dat = '';
      if(cod!==200) err = new Error(`HTTPS GET failed (${cod}).\n${opt}`);
      if(err) { res.resume(); return frej(err); }
      res.setEncoding('utf8');
      res.on('data', (cnk) => dat+=cnk);
      res.on('end', () => fres(dat));
    });
    req.on('error', frej);
  });
};

// Get page image from wikipedia pageimages API response.
function wikiPageImage(res) {
  var pages = res.query.pages;
  if(!pages) return null;
  var page = pages[Object.keys(pages)[0]];
  if(!page.original) return null;
  return page.original.source;
};

// Get image for page.
async function pageImage(pag) {
  var wurl = PAGEIMAGES_URL+encodeURIComponent(pag.raw.title);
  var img = wikiPageImage(JSON.parse(await httpsGet(wurl)));
  if(img) return img;
  var img = await pag.mainImage();
  if(img && !img.endsWith('.svg')) return img;
  var imgs = await pag.images();
  for(var i of imgs||[])
    if(!i.endsWith('.svg')) return i;
  return img||BLANKIMAGE_URL;
};

// Get categories for page.
async function pageCategories(pag) {
  var cats = await pag.categories(), z = [];
  for(var cat of cats) {
    var c = cat.replace('Category:', '');
    if(!CATEGORY_EXC.test(c)) z.push(c);
  }
  return z;
};

// Get forward links for page.
async function pageLinks(pag) {
  var z = await pag.links();
  return z;
};

// Run sql statement with map and join.
function sqlRunMapJoin(db, pre, dat, map, sep) {
  for(var i=0, I=dat.length, z= []; i<I; i+=256) {
    var prt = dat.slice(i, i+256);
    z.push(db.run(pre+prt.map(map).join(sep), prt));
  }
  return Promise.all(z);
};

// Upload Wikipedia page TTS to Youtube.
async function wikipediaTts(out, nam, o) {
  var o = o||{}, i = o.input||{};
  if(LOG) console.log('@wikipediaTts:', out);
  var p = await wiki().page(nam);
  var [txt, img, tags, description] = await Promise.all([
    i.text||p.content(), i.image||pageImage(p),
    i.tags||pageCategories(p), i.description||p.summary()
  ]);
  if(img.endsWith('.svg')) {
    img = img.replace(/\/commons(\/thumb)?\//, '/commons/thumb/');
    img = img.replace()+'/1024px-'+path.basename(img)+'.jpg';
  }
  if(!tags.includes(nam)) tags.unshift(nam);
  if(LOG) {
    console.log('-name:', nam);
    console.log('-tags:', tags);
    console.log('-mainImage:', img);
    console.log('-description:', description);
  }
  var val = {title: nam, description, tags};
  var ext = path.extname(out||'output.json').toLowerCase();
  if(ext==='.json') await youtube(out, txt, img, val, o);
  else if(isVideo(out)) await video(out, txt, img, o);
  else await english(out, txt, o);
  return p;
};

// Upload page, if unique.
async function uploadUnique(nam, o) {
  console.log('.uploadUnique', nam);
  var ids = await youtube.get(nam);
  if(ids.length) {
    if(LOG) console.log('-already exists:', ids);
    return 2;
  }
  try { await wikipediaTts(null, nam, o); }
  catch(e) {
    if(LOG) console.error(e);
    return e.message==='No article found'? -2:-4;
  }
  return 0;
};

// Crawl one page.
async function crawlOne(db, nam) {
  if(LOG) console.log('.crawlOne', nam);
  var p = await wiki().page(nam);
  var lnks = p? await pageLinks(p):[];
  if(LOG) console.log('-links:', lnks.length);
  await sqlRunMapJoin(db, 'INSERT OR IGNORE INTO "pages" VALUES ', lnks, () => '(?, 0, 0, 0)', ', ');
  await sqlRunMapJoin(db, 'UPDATE "pages" SET "references" = "references" + 1 WHERE ', lnks, () => '"title" = ?', ' OR ');
  return p;
};

// Setup crawl list.
async function setup(pth) {
  var db = await sqlite.open(pth||DB);
  if(LOG) console.log('.setup', pth);
  var col = '"title" TEXT PRIMARY KEY, "priority" INTEGER, "references" INTEGER, "status" INTEGER';
  await db.exec(`CREATE TABLE IF NOT EXISTS "pages" (${col})`);
  return db;
};

// Get a page from crawl list.
async function get(db, nam) {
  if(LOG) console.log('.get', nam);
  var whr = '"status" = 0', ord = '"priority" DESC, "references" DESC';
  var sele = `SELECT * FROM "pages" WHERE ${whr} ORDER BY ${ord} LIMIT 1`;
  var seln = 'SELECT * "pages" WHERE "title" = ? LIMIT 1';
  var row = await db.get(nam? seln:sele, nam);
  console.log('-row', row);
  return row;
};

// Add a page to crawl list.
async function add(db, nam, o) {
  if(LOG) console.log('.add', o);
  var o = Object.assign({}, ROW_DEFAULT, o);
  await db.run('INSERT OR IGNORE INTO "pages" VALUES (?, ?, ?, ?)', nam, o.priority, o.references, o.status);
  return nam;
};

// Remove a page from crawl list.
async function remove(db, nam) {
  if(LOG) console.log('.remove', nam);
  await db.run('DELETE FROM "pages" WHERE "title" = ?', nam);
  return nam;
};

// Update a page in crawl list.
async function update(db, nam, o) {
  if(LOG) console.log('.update', nam, o);
  var set = Object.keys(o).map(col => `"${col}" = $${col}`).join(', ');
  await db.run(`UPDATE "pages" SET ${set} WHERE "name" = $name`, Object.assign(set, {title: nam}));
  return nam;
};

// Upload a page.
async function upload(db, o) {
  var o = o||{};
  if(LOG) console.log('.upload', o);
  for(var i=0, I=o.loop||1; i<I; i++) {
    var row = await get(db);
    if(!row) break;
    var status = await uploadUnique(row.title, o);
    await update(db, row.title, {status});
    await crawlOne(db, row.title);
  }
  return i;
};

// Crawl a page.
async function crawl(db, o) {
  var o = o||{}, status = 1;
  if(LOG) console.log('.crawl', o);
  for(var i=0, I=o.loop||1; i<I; i++) {
    var row = await get(db);
    if(!row) break;
    await update(db, row.title, {status});
    await crawlOne(db, row.title);
  }
};
module.exports = wikipediaTts;
wikipediaTts.setup = setup;
wikipediaTts.get = get;
wikipediaTts.add = add;
wikipediaTts.remove = remove;
wikipediaTts.update = update;
wikipediaTts.upload = upload;
wikipediaTts.crawl = crawl;


// Main.
async function main() {
  var cmd = '', nam = '';
  var dbp = DB, out = '', priority = 0, references = 0, status = 0, loop = 1;
  var cmds = new Set(['setup', 'get', 'add', 'remove', 'update', 'upload', 'crawl']);
  for(var i=2, I=A.length; i<I; i++) {
    if(A[i]==='--help') return cp.execSync('less README.md', {cwd: __dirname, stdio: [0, 1, 2]});
    else if(A[i]==='-d' || A[i]==='--db') dbp = A[++i];
    else if(A[i]==='-o' || A[i]==='--output') out = A[++i];
    else if(A[i]==='-p' || A[i]==='--priority') priority = parseInt(A[++i], 10);
    else if(A[i]==='-r' || A[i]==='--references') references = parseInt(A[++i], 10);
    else if(A[i]==='-s' || A[i]==='--status') status = parseInt(A[++i], 10);
    else if(A[i]==='-l' || A[i]==='--loop') loop = parseInt(A[++i], 10);
    else if(!cmd) cmd = A[i];
    else if(!nam) nam = A[i];
  }
  if(!cmds.has(cmd)) return wikipediaTts(out, nam);
  var db = await setup(dbp);
  if(cmd==='setup') return;
  else if(cmd==='get') await get(db, nam);
  else if(cmd==='add') await add(db, nam, {priority, references, status});
  else if(cmd==='remove') await remove(db, nam);
  else if(cmd==='update') await update(db, nam, {priority, references, status});
  else if(cmd==='upload') await upload(db, {loop});
  else await crawl(db, {loop});
};
if(require.main===module) main();
